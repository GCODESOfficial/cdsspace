# Blender Material Recipes for Mockups

Values are starting ranges, not fixed rules. Match the physical reference.

## Paperboard

- Roughness: 0.40 to 0.65
- Normal: fine paper grain, very low strength
- Sheen: low, only when the coating supports it
- Thickness: model the board where edges are visible

## Soft-touch laminate

- Roughness: 0.58 to 0.78
- Specular: controlled
- Normal: extremely fine grain
- Color: deep but not crushed

## Gloss laminate

- Roughness: 0.12 to 0.28
- Clear coat: optional, low to moderate
- Micro-scratches: sparse and subtle

## Foil

- Metallic: 1.0
- Roughness: 0.12 to 0.35
- Height: 0.02 mm to 0.15 mm apparent relief depending on scale
- Use a clean mask derived from the approved artwork

## Spot UV

- Clear coat or secondary glossy layer
- Roughness: 0.05 to 0.18
- Base artwork remains unchanged
- Add tiny height only when physically appropriate

## Frosted plastic

- Transmission: high
- Roughness: 0.25 to 0.55
- Model thickness
- Use low-frequency normal variation

## Clear glass

- Transmission: 1.0
- IOR: around 1.45 to 1.52 depending on glass
- Roughness: 0.0 to 0.08
- Model thickness and liquid boundary

## Fabric

- Base color texture plus weave normal
- Roughness: 0.45 to 0.75
- Sheen: controlled by fabric type
- Deformation should respect seams and load direction
