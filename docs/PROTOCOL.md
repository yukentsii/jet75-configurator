# Jet 75 II HID protocol

Documented for interoperability by observing the keyboard's behaviour and the vendor's public web configurator.
Everything below is verified on a Jet 75 II (wired, firmware 0x0116) unless it is marked otherwise.

## Device

| | |
|---|---|
| USB ID | `41E4:211A` (bootloader: `41E4:2119`, never used by this project) |
| Command interface | interface 1 (`MI_01`), usage page `0x0001`, usage `0x0000` |
| Reports | report ID 0, 64-byte output and input reports (65 bytes on Windows including the ID) |
| Connection | wired USB-C only |

## Packet

Host → keyboard:

```
0   0x55
1   command
2   0x00
3   checksum = (sum of bytes 4..63) & 0xFF
4   length (bytes of data, or bytes requested by a read), max 56
5   offset low
6   offset high
7   0x00
8…  data (writes only)
```

Keyboard → host: the same header, with byte 0 = `0xAA`. Command and offset are echoed, and the data starts at byte 8.
A transfer larger than 56 bytes is split into 56-byte chunks with increasing offsets. Writes are stored immediately, and there is no separate save command.

## Commands

| Cmd | Purpose | Offset / size |
|---|---|---|
| `0x03` | device info | 0 / 56 |
| `0x04` / `0x0E` | profile table read / write | 0 / 56 |
| `0x05` / `0x06` | settings block read / write | 64·profile / 64 |
| `0x07` | factory key map | 512·layer / 384 |
| `0x08` / `0x09` | key map read / write | 2048·profile + 512·layer + 3·key |
| `0x0C` / `0x0D` | macros read / write (shared by all profiles) | 0 / up to 8192 |
| `0xA0` / `0xA1` | per-key trigger read / write | 1024·profile + 8·key |
| `0xA2` / `0xA3` | DKS slots | 768·profile, 24 bytes × 32 |
| `0xA4` / `0xA5` | MT (hold/tap) slots | 256·profile, 6 bytes × 32 |
| `0xA6` / `0xA7` | TGL (toggle) slots | 128·profile, 3 bytes × 32 |

Firmware update, bootloader, calibration and factory-reset commands exist but are deliberately not documented or used here.

### Device info (`0x03`)
Bytes 0–1: firmware version, little-endian (`16 01` = 0x0116). From byte 2: ASCII build date.

### Profile table (`0x04`)
Byte 0 = position of the active profile in the order list, byte 1 = number of enabled profiles (max 4), bytes 2–5 = order.
To switch profile, set byte 0 and write the block back with `0x0E`.

### Settings block (`0x05`, 64 bytes per profile)

| Byte | Meaning |
|---|---|
| 1 | bit 1 = Mac mode (other bits must be kept) |
| 4 | low nibble = polling rate: `1` = 8000 Hz, `2` = 4000, `3` = 2000, `4` = 1000 |
| 5 | dead zone |
| 6 | bit 0 Win lock, bit 1 Alt+Tab lock, bit 2 Alt+F4 lock |
| 7 | bit 1 stability mode, bit 2 adaptive calibration, bits 5–7 debounce level |
| 8 | lighting effect (see below) |
| 9 | brightness 0–100 |
| 10 | 4 − speed (speed 0–4) |
| 11 | direction |
| 12 | 1 = preset colours, 0 = custom colour |
| 14–16 | custom colour R, G, B |

Changing the polling rate of the active profile makes the keyboard reconnect on USB.

Lighting effects: 0 Custom, 1 Rainbow Cycle, 2 Linear Grad, 3 Constant On, 4 Breath, 5 Disco, 6 Horiz Wave, 7 Vert Wave,
8 Center Spread, 9 Star Twinkle, 10 Center Spin, 11 Bottom Up, 12 Recip Rebound, 13 Key Ripple, 14 Solid Ripple, 15 Key Trail,
16 Key Firework, 17 Key Beam, 18 Diag Flow, 19 Laser Rain, 20 Dot Twinkle, 21 Fireworks, 22 Triangle Bounce, 255 Off.

### Key entries (3 bytes)

| Entry | Meaning |
|---|---|
| `10 00 uu` | key with HID usage `uu` |
| `10 mm 00` | modifier: `mm` = 1 << (usage − 0xE0), e.g. `10 02 00` = Left Shift |
| `10 mm uu` | key combo (modifiers + key) |
| `70 nn 00` | macro `nn` |
| `90 nn 00` | DKS slot `nn` |
| `91 nn 00` | TGL slot `nn` |
| `92 nn tt` | MT slot `nn`, hold time `tt` × 10 ms (0 disables the key; default 150 ms) |

### Per-key trigger (8 bytes, distances in 0.01 mm)

```
0   0xA0 | switch type
1   key mode: 0 = quick trigger off, 1 = on, 2 = on + rapid trigger
2   (actuation − 1) low      3   bit 0 = actuation high bit, bits 3–4 press precision, bits 1–2 release precision
4   (rt press − 1) low       5   bit 0 = high bit, bits 1–7 press dead zone
6   (rt release − 1) low     7   bit 0 = high bit, bits 1–7 release dead zone
```

### Macros (shared region)
Bytes 0–31: 16 little-endian pointers. Bytes 32–33: `81 7E`, followed by a mode byte per macro. From byte 64: actions.
An empty macro points at the shared empty entry `00 00 80 00` at offset 64.
Each action is 4 bytes: `[delay−1 lo, delay−1 hi, flags, code]`. In the flags byte, the low bits give the kind (1 modifier, 2 key, 3 mouse), `0x40` means pressed and `0x80` marks the last action.
For a modifier the code byte is a bit mask, `1 << (usage & 7)`.

### MT / TGL / DKS slots
- MT: `[tap key entry][hold key entry]`.
- TGL: `[key entry]`.
- DKS: 4 trigger points, then 4 × `[key entry, phase bits lo, hi]`.
