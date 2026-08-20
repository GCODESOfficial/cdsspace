# Redshift Product Scene Recipe

## Scene scale

- Confirm real product dimensions before lighting.
- Apply or freeze transforms only when the modeling stage requires it.
- Keep deformation controls editable until approval.

## Base lights

- Dome or environment: low enough to avoid flat lighting
- Key area light: large, soft, directional
- Fill area light: broad and weaker than key
- Rim strip: narrow, controlled, used to separate silhouette
- Reflection cards: white for highlights, black for edge definition

## Camera

- Start around 85 mm full-frame equivalent for packaging.
- Adjust camera distance rather than using an extreme focal length.
- Keep verticals controlled.
- Use focus distance on the logo or main panel.

## Materials

- Artwork or albedo: color data
- Roughness: non-color data
- Metalness: non-color data
- Normal: non-color data through normal map node
- Height or displacement: non-color data
- Finish masks: non-color data

## Render outputs

- beauty
- reflection or specular
- shadow
- transmission if relevant
- depth
- normals
- object or material masks
- cryptomatte where available

## Final review

- check print alignment
- check edge bevel size
- check highlight placement
- check contact shadow
- check text at 100 percent zoom
- check color consistency against source artwork
