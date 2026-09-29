"""Road vehicles the game drives (as well as the truck): your old pickup.
Exported as vehicle_<name>.glb. See pickup.py for the named parts."""
import pickup


def build(part):
    return {'pickup': lambda: pickup.build(drivable=True)}[part]()


def PREVIEW(part):
    return dict(target=(0, 0, 0.8), distance=7.5, angle=-35, elevation=14)
