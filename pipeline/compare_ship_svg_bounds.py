#!/usr/bin/env python3
"""
Compare per-zone bounding boxes between two SVGs with relative-error tolerance.

Parses both SVGs, normalizes zone bounding boxes to [0, 1] by viewBox dimensions,
and reports per-zone relative error. Handles both <rect> elements (x/y/width/height)
and <polygon> elements (vertices). Looks for zone-id attributes in data-zone-id or
data-room-id.
"""

import xml.etree.ElementTree as ET
import json
import sys


def get_svg_viewbox(svg_path: str) -> dict:
	"""
	Extract viewBox dimensions from SVG file.

	Args:
		svg_path: path to SVG file

	Returns:
		dict with keys 'width' and 'height'
	"""
	# nosec B314: SVG inputs are repo-local trusted files, not untrusted network input.
	tree = ET.parse(svg_path)  # nosec B314
	root = tree.getroot()
	viewbox = root.get('viewBox')
	if not viewbox:
		raise ValueError(f'SVG {svg_path} has no viewBox attribute')
	parts = viewbox.split()
	if len(parts) < 4:
		raise ValueError(f'SVG {svg_path} viewBox format invalid: {viewbox}')
	return {'width': float(parts[2]), 'height': float(parts[3])}


def extract_zone_id(element: ET.Element) -> str:
	"""
	Extract zone/room ID from element.

	Checks data-zone-id first, then data-room-id, then id attribute.

	Args:
		element: XML element

	Returns:
		zone ID string or empty string if not found
	"""
	zone_id = element.get('data-zone-id') or element.get('data-room-id') or element.get('id') or ''
	return zone_id.strip()


def compute_polygon_bbox(points_str: str) -> dict:
	"""
	Compute bounding box from polygon points string.

	Points are space-separated comma-separated pairs: 'x1,y1 x2,y2 ...'

	Args:
		points_str: polygon points attribute

	Returns:
		dict with keys 'x', 'y', 'width', 'height'
	"""
	coords = []
	parts = points_str.split()
	for part in parts:
		pair = part.split(',')
		if len(pair) == 2:
			try:
				x = float(pair[0])
				y = float(pair[1])
				coords.append((x, y))
			except ValueError:
				pass

	if not coords:
		return {'x': 0, 'y': 0, 'width': 0, 'height': 0}

	xs = [c[0] for c in coords]
	ys = [c[1] for c in coords]
	x_min = min(xs)
	y_min = min(ys)
	x_max = max(xs)
	y_max = max(ys)

	return {
		'x': x_min,
		'y': y_min,
		'width': x_max - x_min,
		'height': y_max - y_min,
	}


def extract_zone_bounds(svg_path: str) -> dict:
	"""
	Extract all zone bounding boxes from SVG.

	Walks elements looking for data-zone-id or data-room-id attributes.
	For <rect>, uses x/y/width/height. For <polygon>, computes bbox from points.

	Args:
		svg_path: path to SVG file

	Returns:
		dict mapping zone_id -> {'x', 'y', 'width', 'height'}
	"""
	# nosec B314: SVG inputs are repo-local trusted files, not untrusted network input.
	tree = ET.parse(svg_path)  # nosec B314
	root = tree.getroot()

	zones = {}

	# Walk all elements in document order
	for elem in root.iter():
		zone_id = extract_zone_id(elem)
		if not zone_id:
			continue

		bbox = None

		if elem.tag.endswith('rect'):
			x = float(elem.get('x', 0))
			y = float(elem.get('y', 0))
			width = float(elem.get('width', 0))
			height = float(elem.get('height', 0))
			bbox = {'x': x, 'y': y, 'width': width, 'height': height}

		elif elem.tag.endswith('polygon'):
			points_str = elem.get('points', '')
			bbox = compute_polygon_bbox(points_str)

		if bbox:
			zones[zone_id] = bbox

	return zones


def normalize_bbox(bbox: dict, viewbox: dict) -> dict:
	"""
	Normalize bounding box to [0, 1] relative to viewBox dimensions.

	Args:
		bbox: dict with 'x', 'y', 'width', 'height'
		viewbox: dict with 'width', 'height'

	Returns:
		dict with normalized 'x', 'y', 'width', 'height'
	"""
	if viewbox['width'] == 0 or viewbox['height'] == 0:
		raise ValueError('viewBox dimensions cannot be zero')

	return {
		'x': bbox['x'] / viewbox['width'],
		'y': bbox['y'] / viewbox['height'],
		'width': bbox['width'] / viewbox['width'],
		'height': bbox['height'] / viewbox['height'],
	}


def compute_max_relative_error(ref_norm: dict, gen_norm: dict) -> float:
	"""
	Compute max relative error across all bbox dimensions.

	Args:
		ref_norm: normalized reference bbox
		gen_norm: normalized generated bbox

	Returns:
		float: max relative error
	"""
	errors = []
	for key in ['x', 'y', 'width', 'height']:
		ref_val = ref_norm[key]
		gen_val = gen_norm[key]

		# Avoid division by zero: if reference is zero, relative error is infinite
		# unless generated is also zero (then error is 0)
		if ref_val == 0:
			if gen_val == 0:
				error = 0.0
			else:
				error = float('inf')
		else:
			error = abs(ref_val - gen_val) / abs(ref_val)

		errors.append(error)

	return max(errors)


def compare_bounds(ref_svg_path: str, gen_svg_path: str, tolerance: float = 0.02) -> dict:
	"""
	Compare per-zone bounding boxes between reference and generated SVGs.

	Normalizes bounds by viewBox dimensions and computes relative error per zone.
	Returns detailed report including zones that passed, failed, or are missing.

	Args:
		ref_svg_path: path to reference SVG
		gen_svg_path: path to generated SVG
		tolerance: relative error threshold (default 0.02 = 2%)

	Returns:
		dict with keys:
		  'viewBox_ref': {'width', 'height'}
		  'viewBox_gen': {'width', 'height'}
		  'tolerance': float
		  'zones': {zone_id: {'ref_bbox', 'gen_bbox', 'ref_norm', 'gen_norm', 'max_rel_error'}}
		  'pass': bool (True if all overlapping zones within tolerance)
		  'out_of_tolerance_zones': list of zone_ids exceeding tolerance
		  'ref_only_zones': list of zone_ids in ref but not in gen
		  'gen_only_zones': list of zone_ids in gen but not in ref
	"""

	# Load viewBox dimensions
	viewbox_ref = get_svg_viewbox(ref_svg_path)
	viewbox_gen = get_svg_viewbox(gen_svg_path)

	# Extract zone bounds
	zones_ref = extract_zone_bounds(ref_svg_path)
	zones_gen = extract_zone_bounds(gen_svg_path)

	# Compute normalized bounds and errors for overlapping zones
	result_zones = {}
	out_of_tolerance = []
	ref_only = []
	gen_only = []

	all_zone_ids = set(zones_ref.keys()) | set(zones_gen.keys())

	for zone_id in sorted(all_zone_ids):
		if zone_id not in zones_ref:
			gen_only.append(zone_id)
			continue
		if zone_id not in zones_gen:
			ref_only.append(zone_id)
			continue

		# Both exist: compute normalized bounds and error
		ref_norm = normalize_bbox(zones_ref[zone_id], viewbox_ref)
		gen_norm = normalize_bbox(zones_gen[zone_id], viewbox_gen)
		max_error = compute_max_relative_error(ref_norm, gen_norm)

		result_zones[zone_id] = {
			'ref_bbox': zones_ref[zone_id],
			'gen_bbox': zones_gen[zone_id],
			'ref_norm': ref_norm,
			'gen_norm': gen_norm,
			'max_rel_error': max_error,
		}

		if max_error > tolerance:
			out_of_tolerance.append(zone_id)

	pass_flag = len(out_of_tolerance) == 0 and len(ref_only) == 0 and len(gen_only) == 0

	return {
		'viewBox_ref': viewbox_ref,
		'viewBox_gen': viewbox_gen,
		'tolerance': tolerance,
		'zones': result_zones,
		'pass': pass_flag,
		'out_of_tolerance_zones': out_of_tolerance,
		'ref_only_zones': ref_only,
		'gen_only_zones': gen_only,
	}


def main():
	"""
	CLI entry point.

	Usage: compare_ship_svg_bounds.py <ref_svg> <gen_svg> <output_json>
	"""
	if len(sys.argv) != 4:
		print('Usage: compare_ship_svg_bounds.py <ref_svg> <gen_svg> <output_json>', file=sys.stderr)
		sys.exit(1)

	ref_svg = sys.argv[1]
	gen_svg = sys.argv[2]
	output_json = sys.argv[3]

	try:
		result = compare_bounds(ref_svg, gen_svg)
	except Exception as e:
		print(f'Error comparing bounds: {e}', file=sys.stderr)
		sys.exit(1)

	# Write JSON output
	try:
		with open(output_json, 'w') as f:
			json.dump(result, f, indent=2)
	except Exception as e:
		print(f'Error writing JSON: {e}', file=sys.stderr)
		sys.exit(1)

	# Print summary
	print(f'Comparison complete: {output_json}', file=sys.stderr)
	if result['pass']:
		print('PASS: All zones within tolerance.', file=sys.stderr)
		sys.exit(0)
	else:
		if result['out_of_tolerance_zones']:
			print(f"FAIL: {len(result['out_of_tolerance_zones'])} zones exceed tolerance: {result['out_of_tolerance_zones']}", file=sys.stderr)
		if result['ref_only_zones']:
			print(f"WARN: {len(result['ref_only_zones'])} zones in reference only: {result['ref_only_zones']}", file=sys.stderr)
		if result['gen_only_zones']:
			print(f"WARN: {len(result['gen_only_zones'])} zones in generated only: {result['gen_only_zones']}", file=sys.stderr)
		sys.exit(1)


if __name__ == '__main__':
	main()
