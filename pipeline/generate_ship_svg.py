#!/usr/bin/env python3
"""
Generate ship SVG and TypeScript layout from YAML geometry spec.

This is the M2a generator that converts data/ship.yaml into:
  1. src/ship_schematic.svg (rendered hull with colored rooms and labels)
  2. src/ship_layout.generated.ts (TypeScript ShipLayout literal)

The generator is idempotent: re-running with the same YAML produces
byte-identical output.

Design inputs:
  - data/ship.yaml: room polygons, colors, labels, doorways
  - Q1 (3 missing doors) and Q2 (6 cabin secondary doors) resolved in
    designer markup pass; data/ship.yaml now has 56 doorways.

Outputs:
  - src/ship_schematic.svg (1008x560 viewBox; colored rooms, labels)
  - src/ship_layout.generated.ts (37 rooms, links derived from doorways)

The generator does not emit force-field door segments to the TS;
that is reserved for M4 (navigation). The SVG shows doorways as
1-tile-wide gaps in room boundaries.
"""

import argparse
import xml.sax.saxutils
import yaml
from typing import Any, Dict, List, Tuple

#============================================

def load_yaml_spec(yaml_path: str) -> Dict[str, Any]:
	"""Load the ship YAML specification."""
	with open(yaml_path) as f:
		spec = yaml.safe_load(f)
	return spec

#============================================

def build_room_lookup(spec: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
	"""Build a lookup table of rooms by ID."""
	rooms = spec.get('rooms', [])
	lookup = {}
	for room in rooms:
		lookup[room['id']] = room
	return lookup

#============================================

def build_doorway_lookup(spec: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
	"""Build a lookup table of doorways by ID."""
	doorways = spec.get('doorways', [])
	lookup = {}
	for dw in doorways:
		lookup[dw['id']] = dw
	return lookup

#============================================

def compute_room_links(spec: Dict[str, Any], room_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
	"""
	Compute links (adjacent rooms) for each room from doorways.

	A link is established when two rooms share a doorway: if doorway
	connects rooms A and B, then A links to B and B links to A.
	"""
	doorways = spec.get('doorways', [])
	links: Dict[str, List[str]] = {}

	# Initialize all rooms with empty link lists
	for room in spec.get('rooms', []):
		links[room['id']] = []

	# Process doorways
	for dw in doorways:
		between = dw.get('between', [])
		if len(between) == 2:
			room_a, room_b = between
			if room_a in links and room_b in links:
				if room_b not in links[room_a]:
					links[room_a].append(room_b)
				if room_a not in links[room_b]:
					links[room_b].append(room_a)

	return links

#============================================

def generate_svg(spec: Dict[str, Any], output_path: str) -> None:
	"""
	Generate SVG from YAML spec.

	Emits a viewBox-based SVG with:
	  - One colored <rect> per room, filled with room_types[type].fill
	  - Room label text (room.name or shortened) centered at label_anchor
	  - Ink color from room_types[type].ink
	  - No doorway geometry; doorways are implicit gaps
	"""
	schematic = spec.get('schematic', {})
	width = schematic.get('width', 1008)
	height = schematic.get('height', 560)
	room_types = spec.get('room_types', {})
	rooms = spec.get('rooms', [])

	# Build SVG manually for determinism (no random ordering)
	lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">',
		'<defs><style type="text/css"><![CDATA[',
		'.room-rect { stroke: #333; stroke-width: 1; }',
		'.room-label { font-family: sans-serif; font-size: 11px; text-anchor: middle; dominant-baseline: middle; font-weight: 500; }',
		']]></style></defs>',
		f'<rect width="{width}" height="{height}" fill="#e8e8e8"/>',
		'<g id="rooms">',
	]

	# Emit each room as a rect
	for room in rooms:
		room_type = room.get('type', 'public')
		type_spec = room_types.get(room_type, {})
		fill = type_spec.get('fill', '#cccccc')
		ink = type_spec.get('ink', '#000000')
		polygon = room.get('polygon', [])

		if len(polygon) >= 3:
			# Convert polygon to path
			path_data = f"M {polygon[0][0]} {polygon[0][1]}"
			for pt in polygon[1:]:
				path_data += f" L {pt[0]} {pt[1]}"
			path_data += " Z"

			lines.append(
				f'\t<path class="room-rect" d="{path_data}" fill="{fill}"/>'
			)

	lines.append('</g>')
	lines.append('<g id="labels">')

	# Emit each room label
	for room in rooms:
		room_type = room.get('type', 'public')
		type_spec = room_types.get(room_type, {})
		ink = type_spec.get('ink', '#000000')
		label_anchor = room.get('label_anchor', [0, 0])

		# Label is room.name; escape XML entities
		name = room.get('name', 'Unknown')
		label_text = xml.sax.saxutils.escape(name)

		lines.append(
			f'\t<text class="room-label" x="{label_anchor[0]}" y="{label_anchor[1]}" fill="{ink}">'
			f'{label_text}</text>'
		)

	lines.append('</g>')
	lines.append('</svg>')

	# Write with LF line endings, no trailing newline
	with open(output_path, 'w', newline='') as f:
		f.write('\n'.join(lines))

#============================================

def zone_kind_from_room_type(room_type: str) -> str:
	"""
	Map design room_type to TypeScript ZoneKind union.

	ZoneKind = "cabins" | "corridor" | "public" | "medical" | "crew" | "operations"
	isolation room_type maps to "medical" ZoneKind (distinct palette, same simulation role).
	"""
	mapping = {
		'command': 'operations',
		'cabin': 'cabins',
		'suite': 'cabins',
		'corridor': 'corridor',
		'atrium': 'public',
		'food': 'public',
		'leisure': 'public',
		'wellness': 'medical',
		'medical': 'medical',
		'isolation': 'medical',
		'retail': 'public',
		'crew': 'crew',
		'crew_op': 'crew',
		'emergency': 'public',
		'transit': 'public',
		'public': 'public',
	}
	return mapping.get(room_type, 'public')

#============================================

def polygon_bounds(polygon: List[List[int]]) -> Tuple[int, int, int, int]:
	"""
	Compute bounding box of a polygon.

	Returns (min_x, min_y, max_x, max_y).
	"""
	xs = [pt[0] for pt in polygon]
	ys = [pt[1] for pt in polygon]
	return (min(xs), min(ys), max(xs), max(ys))

#============================================

def polygon_center(polygon: List[List[int]]) -> Tuple[int, int]:
	"""Compute centroid of a polygon."""
	xs = [pt[0] for pt in polygon]
	ys = [pt[1] for pt in polygon]
	return (sum(xs) // len(xs), sum(ys) // len(ys))

#============================================

def compute_door_segments(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
	"""
	Compute DoorSegment objects from doorways in spec.

	For each doorway, compute:
	  - id (zero-padded d000...d046)
	  - kind ("h" or "v")
	  - tile (x, y from tile_anchor / 28)
	  - segment (pixel coords of the opening)
	  - roomIds (derived by spatial query on the two connected rooms)
	"""
	doorways = spec.get('doorways', [])
	rooms = spec.get('rooms', [])

	# Build room bounds lookup
	room_bounds = {}
	for room in rooms:
		polygon = room.get('polygon', [])
		min_x, min_y, max_x, max_y = polygon_bounds(polygon)
		room_bounds[room['id']] = {
			'min_x': min_x,
			'min_y': min_y,
			'max_x': max_x,
			'max_y': max_y,
		}

	segments = []
	for idx, dw in enumerate(doorways):
		door_id = f"d{idx:03d}"
		dir_val = dw.get('dir', 'h')
		tile_anchor = dw.get('tile_anchor', [0, 0])
		segment = dw.get('segment', [[0, 0], [0, 0]])

		# Tile coords from pixel anchor divided by 28
		tile_x = tile_anchor[0] // 28
		tile_y = tile_anchor[1] // 28

		# Find the two rooms this door connects
		between = dw.get('between', [])
		if len(between) != 2:
			continue

		room_ids = tuple(between)

		seg_obj = {
			'id': door_id,
			'kind': dir_val,
			'tile': {'x': tile_x, 'y': tile_y},
			'segment': [
				{'x': segment[0][0], 'y': segment[0][1]},
				{'x': segment[1][0], 'y': segment[1][1]},
			],
			'roomIds': room_ids,
		}
		segments.append(seg_obj)

	return segments

#============================================

def generate_typescript_layout(
	spec: Dict[str, Any],
	room_links: Dict[str, List[str]],
	output_path: str
) -> None:
	"""
	Generate TypeScript ShipLayout literal.

	Emits src/ship_layout.generated.ts with:
	  - ShipLayout type match
	  - schematicWidth, schematicHeight
	  - Array of ShipZone literals
	  - links derived from doorways
	  - doors array with DoorSegment objects
	"""
	schematic = spec.get('schematic', {})
	width = schematic.get('width', 1008)
	height = schematic.get('height', 560)
	room_types = spec.get('room_types', {})
	rooms = spec.get('rooms', [])
	door_segments = compute_door_segments(spec)

	lines = [
		'// This file is generated by pipeline/generate_ship_svg.py',
		'// Do not edit manually.',
		'',
		'import type { ShipLayout } from "./types/ship.js";',
		'',
		'export const SHIP_LAYOUT: ShipLayout = {',
		f'\tschematicWidth: {width},',
		f'\tschematicHeight: {height},',
		'\tzones: [',
	]

	# Emit each zone
	for room in rooms:
		room_id = room['id']
		room_type = room.get('type', 'public')
		type_spec = room_types.get(room_type, {})
		fill = type_spec.get('fill', '#cccccc')
		kind = zone_kind_from_room_type(room_type)
		polygon = room.get('polygon', [])

		min_x, min_y, max_x, max_y = polygon_bounds(polygon)
		width_px = max_x - min_x
		height_px = max_y - min_y
		center_x, center_y = polygon_center(polygon)

		# Build links array
		links = room_links.get(room_id, [])
		links_str = ', '.join(f'"{link_id}"' for link_id in links)

		lines.append('\t\t{')
		lines.append(f'\t\t\tid: "{room_id}",')
		lines.append(f'\t\t\tlabel: "{room["name"]}",')
		lines.append(f'\t\t\tkind: "{kind}",')
		lines.append('\t\t\tbounds: {')
		lines.append(f'\t\t\t\tx: {min_x},')
		lines.append(f'\t\t\t\ty: {min_y},')
		lines.append(f'\t\t\t\twidth: {width_px},')
		lines.append(f'\t\t\t\theight: {height_px},')
		lines.append('\t\t\t},')
		lines.append('\t\t\tcenter: {')
		lines.append(f'\t\t\t\tx: {center_x},')
		lines.append(f'\t\t\t\ty: {center_y},')
		lines.append('\t\t\t},')
		lines.append(f'\t\t\tlinks: [{links_str}],')
		lines.append(f'\t\t\tcolor: "{fill}",')
		lines.append('\t\t},')

	lines.extend([
		'\t],',
		'\tdoors: [',
	])

	# Emit each door segment
	for door in door_segments:
		door_id = door['id']
		kind = door['kind']
		tile = door['tile']
		segment = door['segment']
		room_ids = door['roomIds']

		lines.append('\t\t{')
		lines.append(f'\t\t\tid: "{door_id}",')
		lines.append(f'\t\t\tkind: "{kind}",')
		lines.append('\t\t\ttile: {')
		lines.append(f'\t\t\t\tx: {tile["x"]},')
		lines.append(f'\t\t\t\ty: {tile["y"]},')
		lines.append('\t\t\t},')
		lines.append('\t\t\tsegment: [')
		lines.append(f'\t\t\t\t{{ x: {segment[0]["x"]}, y: {segment[0]["y"]} }},')
		lines.append(f'\t\t\t\t{{ x: {segment[1]["x"]}, y: {segment[1]["y"]} }},')
		lines.append('\t\t\t],')
		lines.append(f'\t\t\troomIds: ["{room_ids[0]}", "{room_ids[1]}"],')
		lines.append('\t\t},')

	lines.extend([
		'\t],',
		'};',
	])

	# Write with LF line endings
	with open(output_path, 'w', newline='') as f:
		f.write('\n'.join(lines) + '\n')

#============================================

def main() -> None:
	"""Main entry point."""
	parser = argparse.ArgumentParser(
		description='Generate ship SVG and TypeScript layout from YAML'
	)
	parser.add_argument(
		'--yaml',
		default='data/ship.yaml',
		help='Path to ship YAML (default: data/ship.yaml)'
	)
	parser.add_argument(
		'--svg',
		default='src/ship_schematic.svg',
		help='Output SVG path (default: src/ship_schematic.svg)'
	)
	parser.add_argument(
		'--ts',
		default='src/ship_layout.generated.ts',
		help='Output TS path (default: src/ship_layout.generated.ts)'
	)
	args = parser.parse_args()

	spec = load_yaml_spec(args.yaml)
	room_lookup = build_room_lookup(spec)
	room_links = compute_room_links(spec, room_lookup)
	door_segments = compute_door_segments(spec)

	generate_svg(spec, args.svg)
	generate_typescript_layout(spec, room_links, args.ts)

	rooms_count = len(spec.get('rooms', []))
	doorways_count = len(spec.get('doorways', []))
	link_edges = sum(len(links) for links in room_links.values()) // 2
	doors_count = len(door_segments)

	print(f"Generated {rooms_count} rooms, {doorways_count} doorways, {doors_count} doors, {link_edges} link edges")
	print(f"SVG: {args.svg}")
	print(f"TS:  {args.ts}")

#============================================

if __name__ == '__main__':
	main()
