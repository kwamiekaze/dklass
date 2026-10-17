# Architecture rules

- Keep Road Test Challenge rendering in `src/games/roadtest/g3d` separate from its headless rules engine; this preserves scoring while allowing renderer changes.
- Keep Phaser as the Road Test Challenge fallback for `?engine=2d` and unavailable WebGL; this preserves playability on unsupported devices.