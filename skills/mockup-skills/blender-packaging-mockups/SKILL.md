---
name: blender-packaging-mockups
description: Build photorealistic, editable packaging and brand collateral mockups in Blender using accurate dimensions, UV mapping, physically based materials, Cycles rendering, studio lighting, and multi-angle scene organization. Use for cartons, rigid boxes, bottles, jars, pouches, bags, cups, stationery, signage, product displays, and hero product renders.
metadata:
  short-description: Photoreal Blender packaging mockups
---

# Blender Packaging Mockups

## Goal

Create production-minded 3D mockups that preserve supplied artwork exactly and remain editable for new angles, colors, finishes, and campaign scenes.

## Truthfulness rule

Only say Blender was used when Blender is installed or a connected Blender tool actually executed the scene. When Blender is unavailable, use this skill as the scene and quality specification, then switch to built-in image generation plus deterministic artwork compositing.

## Core workflow

### 1. Normalize inputs

Identify:

- product type and dimensions
- visible panels
- dieline or flat artwork
- material and print finish
- camera view and output ratio
- reference scene, if any
- areas that cannot change

Use millimeters or centimeters consistently. Model at real scale because bevel width, depth of field, light size, and material response depend on scale.

### 2. Build clean geometry

- Start with the simplest physically correct primitive or low-poly shell.
- Apply scale before bevels and modifiers.
- Add tiny real-world bevels to manufactured edges.
- Give paperboard, plastic, glass, and metal plausible thickness.
- Use subdivision only where curvature requires it.
- Keep topology clean enough for UVs and silhouette quality.
- For cartons, model panel breaks, lid overlap, tuck flaps, and fold compression when visible.
- For flexible packaging, use controlled cloth or lattice deformation, then preserve heat-seal and gusset logic.

### 3. Prepare UVs and artwork

- Use a supplied dieline when available.
- Place seams on hidden or natural production edges.
- Minimize UV stretch on branded panels.
- Test with a UV grid before applying artwork.
- Keep the artwork image unaltered in content and aspect ratio.
- Use separate materials or masks for foil, spot UV, emboss, windows, and transparent areas.
- For a quick front-panel proof, a slightly offset decal plane is acceptable, but final multi-angle work should use proper UV mapping.

### 4. Create physically based materials

Use Principled BSDF or an equivalent PBR node setup.

#### Coated paperboard

- Base color from artwork texture
- Roughness 0.35 to 0.55 depending on coating
- Specular response controlled, not mirror-like
- Fine paper noise at subtle normal strength
- Optional clear-coat mask for spot UV

#### Uncoated paper

- Roughness 0.6 to 0.8
- Fine fiber variation in roughness and normal
- Slightly softened ink response

#### Matte or soft-touch laminate

- Roughness 0.5 to 0.75
- Broad low-intensity highlight
- Very fine tactile grain

#### Gloss laminate

- Roughness 0.12 to 0.28
- Stronger clean reflection with natural falloff
- Keep micro-scratches subtle and scale-correct

#### Metallic foil

- Metallic 1.0
- Roughness 0.12 to 0.35 depending on foil type
- Slight height or bevel so the foil catches light
- Use the foil mask to control only the approved artwork region

#### Glass and clear plastic

- Model real thickness
- Use transmission and index of refraction appropriate to the material
- Add a separate inner volume or liquid where required
- Avoid perfectly clean edges and perfectly black reflections

### 5. Lighting

For studio product work, start with:

- large area key light above and to one side
- broad fill at lower intensity
- narrow rim or strip light behind or to the side
- large white cards for controlled reflections
- neutral ground plane for contact shadow and bounce
- optional HDRI at low strength for reflection richness

Glossy objects are shaped by reflected cards and light sources. Move the light geometry until highlights describe the product's form.

### 6. Camera

- Use 70 mm to 105 mm full-frame equivalent for most packaging hero shots.
- Keep verticals controlled.
- Aim at the visual center of the primary panel.
- Use a slight three-quarter rotation to reveal depth without sacrificing readability.
- Use depth of field sparingly and focus on the logo or main panel.
- Match a reference image by aligning horizon, vanishing points, camera height, tilt, and focal length before refining materials.

### 7. Render

Use Cycles for final photoreal output when available.

- Enable GPU rendering when supported.
- Use adaptive sampling and denoising carefully.
- Increase samples for glass, glossy reflections, fine foil, and deep depth of field.
- Render at 1.5 to 2 times delivery size when fine text and edges are important, then downsample once.
- Use AgX or the current physically appropriate view transform.
- Keep exposure and contrast controlled. Do not crush blacks or clip highlights.
- Save a multilayer EXR or separate passes for demanding compositing work.

Useful passes include diffuse, glossy, transmission, shadow, ambient occlusion, normal, depth, object masks, and cryptomatte where available.

### 8. Finishing

- Composite exact artwork before adding final grain or sharpening.
- Add only subtle bloom, glare, vignette, or chromatic effects.
- Preserve readable small text.
- Add micro-imperfections at realistic scale, not random grunge.
- Keep a transparent-background version when useful.

## Scene organization

Use clear collections:

- PRODUCT
- ARTWORK
- FLOOR
- LIGHTS
- CAMERAS
- BACKGROUND
- HELPERS

Name materials by substrate and finish. Name cameras by view, such as HERO_34, FRONT, DETAIL_FOIL, and TOP.

## Automation

The bundled `scripts/carton_hero_scene.py` is a starting point for a simple rigid carton hero scene. Run it only inside Blender. Replace its generic front artwork plane with a full UV workflow for production jobs.

## Quality gate

Before export:

- artwork is exact and not mirrored or stretched
- visible panels read correctly
- no UV seams cross critical logos or text
- bevels are scale-correct
- product is grounded
- highlights explain the shape
- material roughness matches the substrate
- foil, spot UV, and emboss are separated and physically responsive
- no fireflies, noise patches, denoising smears, or clipped highlights
- all requested views use the same geometry and artwork
