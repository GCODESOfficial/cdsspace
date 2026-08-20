---
name: brand-mockup-director
description: Direct high-fidelity packaging and brand collateral mockups from flat artwork, dielines, reference photos, or verbal briefs. Use for boxes, pouches, bottles, cups, bags, stationery, signage, event collateral, apparel, devices, vehicles, and product presentation scenes. Orchestrates Blender, Cinema 4D/Redshift, Photoshop-style compositing, and built-in image generation while preserving exact brand artwork.
metadata:
  short-description: CDS Space photoreal mockup director
---

# Brand Mockup Director

## Purpose

Create polished, photorealistic mockups that look physically manufactured and professionally photographed while preserving the supplied brand design exactly.

This skill is optimized for CDS Space packaging, product branding, event collateral, environmental branding, stationery, and campaign presentation work.

## Non-negotiable fidelity rules

1. Preserve the supplied logo, typography, spelling, layout, colors, symbols, artwork proportions, and all defining design details.
2. Do not redraw, reinterpret, beautify, simplify, or invent any part of approved artwork unless the user explicitly requests a redesign.
3. Treat the user's flat design as production artwork. Bend, wrap, fold, emboss, print, foil, or project it onto the physical object, but do not change its content.
4. Keep packaging geometry plausible. Seams, folds, caps, lids, handles, labels, panels, gussets, hinges, and openings must make physical sense.
5. Maintain realistic material response, contact shadows, reflections, roughness, edge wear, microtexture, depth of field, and lens perspective.
6. Avoid plastic-looking surfaces, floating products, impossible shadows, warped logos, invented text, excessive saturation, over-sharpening, and fake-looking blur.
7. For people, preserve identity and anatomy exactly. Product mockups should not introduce people unless requested.

## Default operating mode

When the user supplies a flat design and a mockup reference, assume the instruction is:

- keep the supplied design at 100 percent resemblance
- preserve the reference object's structure, view, and fold direction
- replace only the printed artwork or requested branding area
- improve lighting, realism, material quality, and presentation

Do not ask unnecessary questions. When dimensions or finish are absent, use plausible industry-standard proportions and state the assumption only when it materially affects production accuracy.

## Pipeline selection

Choose the strongest available route:

### Route A: Exact 3D production mockup

Use Blender or Cinema 4D/Redshift when exact dimensions, editable geometry, multiple angles, animation, or repeatable product scenes are required.

### Route B: Reference-image reconstruction

Use built-in image generation/editing when the user provides a mockup reference or product photograph and wants a realistic transformation. Preserve the target image's composition and requested unchanged areas.

### Route C: Two-pass fidelity workflow

Use this by default for branded packaging:

1. Generate or render a clean physical object and scene without fragile text.
2. Composite the exact supplied artwork onto the correct surfaces using a deterministic perspective or UV workflow.
3. Reintroduce surface lighting, folds, reflections, grain, and print finish above the artwork.
4. Inspect the result at 100 percent zoom for text and logo fidelity.

This route prevents AI text distortion while retaining photorealism.

### Route D: Photoshop-style production composite

Use for fast campaign mockups, signage placement, billboards, stationery, screens, flat or lightly curved packaging, and edits where the base photograph already contains convincing geometry and lighting.

## Input normalization

Build an internal brief from whatever the user provides:

- object or collateral type
- flat artwork or logo source
- dieline or dimensions, if available
- reference object or scene
- visible panels and orientation
- substrate and finish
- required camera angle
- background or environment
- output aspect ratio and size
- unchanged areas
- exact requested change

When information is missing, default to a premium studio hero image with a three-quarter view, natural perspective, clean background, physically plausible material, soft directional key light, broad fill, subtle rim light, and grounded contact shadow.

## Material realism

Match surface behavior, not only color:

- uncoated paper: broad soft highlights, visible fiber, moderate roughness
- coated carton: controlled specular highlight, fine print texture, crisp folds
- matte laminate: low-glare broad reflection, smooth but not plastic
- gloss laminate: sharper reflections with realistic falloff
- soft-touch laminate: deep color, muted highlight, fine tactile grain
- foil: metallic reflection, slight emboss depth, no flat yellow substitute
- spot UV: localized high-gloss response aligned precisely to artwork
- clear plastic: correct refraction, thickness, edge highlights, internal shadows
- glass: real thickness, controlled reflections, absorption, believable liquid boundary
- fabric: weave direction, soft deformation, seam and stitch logic
- painted metal: coating roughness over a rigid substrate, controlled edge response

## Camera and composition defaults

- Hero product: 70 mm to 105 mm full-frame equivalent
- Small collateral detail: 85 mm to 135 mm
- Environmental branding: 24 mm to 50 mm with corrected verticals
- Avoid extreme wide-angle distortion unless requested
- Keep the key panel readable and near the optical center
- Use depth of field sparingly. The brand and key product edges should remain sharp
- Leave intentional negative space when the image will carry marketing copy

## Lighting defaults

Use a physically plausible studio setup:

1. Large soft key above and to one side.
2. Broad fill opposite the key at lower intensity.
3. Narrow rim or strip light to separate the product from the background.
4. Optional top card or flag to sculpt glossy surfaces.
5. Contact shadow and reflected bounce from the ground surface.

For lifestyle scenes, match the direction, softness, temperature, and exposure of the environment rather than forcing a studio look.

## Print-finishing workflow

Create finishes as separate masks or material layers:

- emboss and deboss from height or displacement masks
- foil from a metallic mask plus micro-bevel
- spot UV from a clear-coat or glossy mask
- die-cut windows from real geometry or alpha with thickness
- letterpress from shallow recessed displacement
- screen print from a slightly raised ink layer
- vinyl signage from a thin material layer with edge thickness and substrate interaction

Do not fake every finish with a flat color change.

## Collateral-specific rules

### Boxes and cartons

Respect panel boundaries, fold direction, board thickness, lid overlap, tuck flaps, and corner compression. Apply tiny bevels so highlights reveal the form.

### Pouches and flexible packs

Preserve gussets, heat seals, wrinkles, tension lines, and controlled crumpling. Artwork must deform with the material, not float above it.

### Bottles, jars, and cups

Respect cylindrical perspective, label overlap, cap geometry, transparent material thickness, liquid line, and condensation only when contextually appropriate.

### Bags

Preserve handles, folds, side gussets, paper grain, fabric weave, and natural load-bearing deformation.

### Stationery

Keep paper edges, stacking, slight curl, print registration, realistic shadows between sheets, and consistent scale.

### Signage and environmental branding

Match camera perspective, surface texture, occlusion, ambient light, weathering level, and installation method. Logos must follow the physical plane and be partially occluded where real objects pass in front.

### Screens and devices

Match screen perspective, glass reflections, bezel occlusion, luminance, black level, and ambient color cast. Do not paste a bright flat rectangle over the device.

## Quality gate

Before delivery, inspect:

- exact spelling and typography
- exact logo geometry and proportions
- color consistency against the source
- correct panel orientation and reading direction
- no duplicated, missing, or invented design elements
- believable scale and object proportions
- correct contact shadow and no floating
- material-specific highlights and reflections
- realistic seams, folds, and edge thickness
- no broken perspective or impossible geometry
- no unwanted jewelry, objects, people, labels, QR codes, or locks
- requested unchanged areas remain unchanged
- output is clean at full resolution

Use `references/quality-gate.md` for the full checklist.

## Deliverable standard

Unless the user requests otherwise, produce one premium hero mockup at the requested aspect ratio. For a presentation set, use:

1. Hero three-quarter view
2. Front or primary panel view
3. Detail close-up showing finish and texture
4. Contextual or stacked composition

Use consistent object geometry, artwork, material, lighting, and color across all views.

## Available companion skills

- `blender-packaging-mockups` for editable 3D scenes and exact multi-angle output
- `cinema4d-redshift-mockups` for Redshift product visualization and motion-ready scenes
- `photoshop-brand-mockups` for exact artwork placement, perspective compositing, and finishing

If an application is not installed or connected, do not claim it was used. Apply the same production principles with the tools that are actually available.
