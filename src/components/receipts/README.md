# Thermal Receipt Templates (58 mm)

This directory is reserved for future HTML and CSS print templates targeting 58 mm desktop thermal receipt printers (MPT-II / POS58 compatible).

## Technical Strategy
- **Standard Browser Printing:** Using `@media print` CSS rules with exact 58 mm paper width (`58mm auto`, safe printable boundary 48 mm).
- **Target Hardware:** Desktop/laptop connected to thermal printer via USB, network, or OS-paired printer driver.
- **Web Limitation Note:** Traditional Classic Bluetooth SPP/RFCOMM used in the Android mobile app is NOT supported by standard web browsers. Browser printing evaluates OS print spooling via `window.print()` or Web Serial API for tethered USB POS devices in later phases.
- **Implementation Status:** Phase 1 preparation only. Receipt generation and printing logic will be implemented in subsequent phases after portal core features are verified.
