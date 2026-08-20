---
name: photoshop-brand-mockups
description: Produce exact, realistic brand and packaging mockups with Photoshop-style nondestructive compositing. Use Smart Objects, masks, perspective transforms, displacement, blend modes, surface-light preservation, print finishing, Camera Raw-style grading, and deterministic artwork placement for packaging, stationery, signage, screens, apparel, and environmental branding.
metadata:
  short-description: Exact Photoshop-style brand mockups
---

# Photoshop Brand Mockups

## Goal

Place approved artwork onto a convincing physical object or real photograph without changing the design, while preserving perspective, material texture, folds, lighting, reflections, shadows, occlusion, and photographic character.

## Truthfulness rule

Only say Adobe Photoshop was used when Photoshop or an Adobe service actually executed the file. When Photoshop is unavailable, use the bundled deterministic compositing script and available image tools while following this same nondestructive layer logic.

## Nondestructive layer stack

Use this conceptual order:

1. Global grade and output controls
2. Grain and final sharpening
3. Environmental reflections and highlights
4. Surface texture and microdetail
5. Print finishes such as foil, gloss, emboss, and ink
6. Exact artwork Smart Object or deterministic artwork layer
7. Surface shading and displacement affecting the artwork
8. Occlusion masks for folds, seams, hands, caps, edges, or foreground objects
9. Base product or photograph
10. Cleanup and background reconstruction

Do not flatten until final export.

## Exact artwork workflow

### 1. Prepare artwork

- Use the highest-resolution source supplied.
- Preserve aspect ratio and color.
- Keep logo and text as vectors or Smart Objects when possible.
- Remove only unwanted external background, not internal design elements.
- Do not recreate text with a substitute font.

### 2. Match geometry

- Identify the target plane or curved surface.
- Match the four corners for flat surfaces.
- Use cylindrical or mesh warp for curved labels.
- Use multiple linked artwork instances for separate panels.
- Keep panel seams and fold lines aligned.

### 3. Preserve surface light

A realistic composite must inherit the base object's lighting.

- Derive low-frequency highlights and shadows from the base surface.
- Apply them above the artwork using controlled multiply, screen, soft-light, luminosity, or blend-if logic.
- Keep high-frequency texture above the artwork at low opacity.
- Use displacement for folds, paper grain, fabric weave, dents, and curved surfaces.
- Avoid using a single flat opacity adjustment as the only realism step.

### 4. Build occlusion

Mask the artwork behind:

- folds and seams
- caps, lids, handles, and labels
- fingers or objects in front
- deep creases and overlapping panels
- edge bevels where the print should stop

### 5. Add print finishes

#### Foil

- Create a clean finish mask from approved artwork.
- Use metallic reflections or a sampled environment response.
- Add a shallow bevel or emboss.
- Vary brightness with surface angle, not with random yellow gradients.

#### Spot UV

- Duplicate the approved artwork mask only where gloss is intended.
- Add controlled specular highlights and low roughness.
- Preserve the base print color underneath.

#### Emboss and deboss

- Use a clean grayscale height map.
- Combine shallow bevel, directional light response, and displacement.
- Keep depth scale believable.

#### Ink on paper

- Let paper grain pass subtly through the ink.
- Reduce highlight response according to ink and coating.
- Avoid perfectly uniform black or color in close-up.

## Perspective and reference matching

Before compositing:

- align horizon and vanishing lines
- correct lens distortion only when it blocks accurate placement
- match camera tilt and object rotation
- preserve the reference composition unless the user requests reframing
- use separate transforms for surfaces with different planes

## Bundled deterministic tool

Use `scripts/perspective_mockup.py` when a flat artwork image must be placed exactly onto a quadrilateral surface in a base photograph.

It can:

- perspective-warp the artwork
- preserve artwork alpha
- inherit low-frequency light from the base surface
- optionally add mild displacement from surface luminance
- soften only the artwork edge
- export a high-resolution PNG

This is especially useful for billboards, box panels, screens, signs, books, cards, posters, and flat packaging faces.

## Curved surfaces

For bottles, cups, pouches, fabric, and other curved or folded surfaces:

- split the surface into logical zones or use a mesh warp
- use displacement from the real object
- retain seam and overlap behavior
- reduce artwork contrast at grazing angles
- allow reflections to pass above the print
- do not wrap text so aggressively that letterforms become unreadable

## Final photographic finish

- Match black point, white point, exposure, and color temperature to the base image.
- Add grain once at the final size.
- Apply restrained sharpening after resizing.
- Remove halos around masks.
- Check the composite at 100 percent and at presentation size.
- Preserve a layered master or a reproducible script command.

## Quality gate

- exact spelling, logo, layout, and color
- correct perspective on each surface
- artwork follows folds and curvature
- base highlights and shadows remain visible
- realistic occlusion at edges and foreground objects
- no mask halos or hard cutout edges
- print finish aligns exactly with its mask
- no unwanted changes outside the requested branding area
- product remains grounded and photographically coherent
