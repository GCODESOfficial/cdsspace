---
name: cinema4d-redshift-mockups
description: Create premium packaging, product, and brand collateral mockups in Maxon Cinema 4D with Redshift using accurate scale, clean geometry, UV artwork, physically based materials, controlled studio lighting, cameras, AOVs, and motion-ready scene organization.
metadata:
  short-description: Cinema 4D Redshift product mockups
---

# Cinema 4D Redshift Mockups

## Goal

Build high-end product visualization scenes suitable for packaging presentations, campaign stills, turntables, close-up finish shots, and motion graphics while preserving brand artwork exactly.

## Truthfulness rule

Only claim Cinema 4D or Redshift execution when the application or a connected tool actually ran. When unavailable, use this skill as the visual specification and complete the job with available image-generation and compositing tools.

## Scene workflow

### 1. Work at physical scale

Use a consistent real-world unit. Correct scale affects bevels, camera depth of field, light softness, texture frequency, displacement, and reflection behavior.

### 2. Model for silhouette and manufacturing logic

- Use parametric primitives, splines, generators, deformers, and subdivision where they improve editability.
- Keep hard-surface edges slightly beveled.
- Add board, glass, plastic, metal, or fabric thickness where visible.
- Model lids, seams, gussets, closures, labels, caps, handles, folds, and die-cuts plausibly.
- Use deformers non-destructively until the shape is approved.
- Preserve clean normals and avoid shading artifacts on hero edges.

### 3. UV and artwork

- Import approved artwork without changing its content.
- Use a dieline for cartons and complex packs.
- Place seams away from primary logos and text.
- Check distortion with a UV grid.
- Separate masks for base print, foil, spot gloss, emboss, deboss, windows, and alpha cutouts.
- For simple cylindrical labels, align the seam to a hidden rear position.
- For flexible packs, deform geometry and artwork together.

### 4. Redshift materials

Use the current Redshift Standard Material or equivalent physically based node setup.

Build each material from:

- base color or artwork
- metalness where relevant
- roughness
- normal or bump
- displacement only when silhouette or relief requires it
- coat for laminate or spot gloss
- transmission and refraction for glass and clear plastic
- opacity for windows or cutouts

Do not use roughness as random noise. Texture scale must match the physical object.

### 5. Lighting

A dependable premium product setup:

1. Redshift Dome Light or environment at low to moderate strength for reflection richness.
2. Large rectangular area key light above and to one side.
3. Broad fill light at lower exposure.
4. Narrow strip or rim light for edge separation.
5. White and black reflection cards to sculpt glossy materials.
6. Ground plane or cyclorama for contact shadow and bounce.

Use IPR or progressive rendering to tune highlights interactively. Glossy objects are shaped by reflections, so adjust source size, position, spread, and flags before raising samples.

### 6. Camera

- Use a Redshift-aware camera setup.
- Default to 70 mm to 105 mm for product hero images.
- Keep the primary panel readable.
- Match reference perspective before styling.
- Use depth of field lightly and focus on the brand mark or primary panel.
- For motion, lock camera naming and framing before animating product components.

### 7. Color management and exposure

Use the current OCIO or ACES-compatible workflow available in the installed version. Keep textures tagged correctly:

- color artwork and albedo as color data
- roughness, metalness, normal, height, masks, and displacement as non-color data

Protect highlights and retain deep shadow detail. Avoid solving lighting problems with excessive post contrast.

### 8. Rendering and AOVs

For demanding work, render:

- beauty
- diffuse lighting and color
- specular or reflection
- refraction or transmission
- shadow
- ambient occlusion where useful
- depth
- normals
- object or material masks
- cryptomatte where supported

Use AOVs to refine the image without repainting the approved artwork.

### 9. Motion-ready organization

Use clear object groups:

- PRODUCT
- ARTWORK
- CAPS_AND_CLOSURES
- FLOOR
- LIGHTS
- CAMERAS
- BACKGROUND
- REFLECTION_CARDS
- HELPERS

Name takes or render presets by output, such as HERO_STILL, FRONT_STILL, TURNTABLE, FOIL_DETAIL, and SOCIAL_VERTICAL.

## Material recipes

### Coated carton

- moderate roughness
- subtle paper normal
- crisp print texture
- small edge bevels

### Matte laminate

- broad low-glare reflection
- higher roughness
- very fine surface grain

### Gloss laminate

- lower roughness
- clean controlled reflection
- subtle micro-scratches only in close-up

### Foil

- metallic response
- controlled roughness
- shallow raised geometry or bump
- clean mask tied exactly to the approved artwork

### Spot gloss

- coat or layered material applied only through the finish mask
- same base color underneath
- reflection must follow the scene

### Glass or clear plastic

- real wall thickness
- correct transmission and refraction
- believable edge highlights
- separate inner liquid or contents

## Quality gate

- exact artwork and spelling
- correct panel direction
- no UV stretching on key elements
- scale-correct bevels and texture frequency
- physically logical geometry
- grounded product with coherent shadow
- controlled highlights that describe the form
- no noisy reflections, fireflies, or denoising smears
- correct color-data tagging
- consistent geometry and artwork across all takes

See `references/redshift-scene-recipe.md` for the standard scene recipe.
