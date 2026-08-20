#!/usr/bin/env python3
"""Create a simple Blender carton hero scene.

Run inside Blender:
blender --background --python carton_hero_scene.py -- \
  --artwork /absolute/path/front.png \
  --output /absolute/path/render.png \
  --width 0.18 --height 0.26 --depth 0.07 --samples 256

Dimensions are in meters. This is a starting scene, not a replacement for a
full dieline and UV workflow.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--artwork", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=float, default=0.18)
    parser.add_argument("--height", type=float, default=0.26)
    parser.add_argument("--depth", type=float, default=0.07)
    parser.add_argument("--samples", type=int, default=256)
    return parser.parse_args(argv)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name: str, location: tuple[float, float, float], energy: float,
             size: float, target: Vector) -> bpy.types.Object:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def make_principled_material(name: str, color: tuple[float, float, float, float],
                             roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def make_art_material(image_path: str) -> bpy.types.Material:
    mat = bpy.data.materials.new("ARTWORK_FRONT")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path, check_existing=True)
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.42
    mat.surface_render_method = "DITHERED" if hasattr(mat, "surface_render_method") else "DITHERED"
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def main() -> None:
    args = parse_args()
    if not os.path.isfile(args.artwork):
        raise FileNotFoundError(args.artwork)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = max(32, args.samples)
        scene.cycles.use_denoising = True
    except Exception:
        pass

    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.view_transform = "AgX"
        except Exception:
            pass

    # Carton body
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, args.height / 2))
    box = bpy.context.active_object
    box.name = "CARTON_BODY"
    box.dimensions = (args.width, args.depth, args.height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = box.modifiers.new("EDGE_BEVEL", "BEVEL")
    bevel.width = min(args.width, args.depth, args.height) * 0.012
    bevel.segments = 3
    box.data.materials.append(make_principled_material("COATED_BOARD", (0.96, 0.96, 0.96, 1), 0.48))

    # Exact front artwork as a separate plane.
    bpy.ops.mesh.primitive_plane_add(location=(0, -args.depth / 2 - 0.0002, args.height / 2),
                                     rotation=(math.radians(90), 0, 0))
    art = bpy.context.active_object
    art.name = "FRONT_ARTWORK"
    art.dimensions = (args.width * 0.985, args.height * 0.985, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    art.data.materials.append(make_art_material(args.artwork))

    # Floor
    bpy.ops.mesh.primitive_plane_add(size=4.0, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "FLOOR"
    floor.data.materials.append(make_principled_material("FLOOR_MAT", (0.12, 0.12, 0.12, 1), 0.62))

    target = Vector((0, 0, args.height * 0.5))
    add_area("KEY", (-0.65, -0.7, 0.9), 700, 0.65, target)
    add_area("FILL", (0.65, -0.35, 0.55), 300, 0.8, target)
    add_area("RIM", (0.25, 0.5, 0.8), 500, 0.35, target)

    # Camera
    cam_data = bpy.data.cameras.new("HERO_CAMERA")
    cam = bpy.data.objects.new("HERO_CAMERA", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.38, -0.62, 0.34)
    cam_data.lens = 85
    look_at(cam, target)
    scene.camera = cam

    # World
    scene.world.color = (0.025, 0.025, 0.025)

    scene.render.filepath = os.path.abspath(args.output)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
