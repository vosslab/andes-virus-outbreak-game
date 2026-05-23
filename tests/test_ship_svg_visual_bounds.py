"""
Test SVG visual bounds compliance against reference.

Compares per-zone bounding boxes from the generated ship SVG against the
frozen reference, ensuring relative error stays within the 2% tolerance.

This test is skipped if the generated SVG has not yet been created by
the M2a generator.
"""

import os
import sys
import json
import pytest

# Add pipeline dir to path to import the comparator
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPELINE_DIR = os.path.join(REPO_ROOT, 'pipeline')
sys.path.insert(0, PIPELINE_DIR)

import compare_ship_svg_bounds


REFERENCE_SVG = os.path.join(REPO_ROOT, 'data', 'reference', 'ship_schematic_pre_m2.svg')
GENERATED_SVG = os.path.join(REPO_ROOT, 'src', 'ship_schematic.svg')


def test_ship_svg_visual_bounds_within_tolerance():
	"""
	Verify that every zone in the generated SVG's bounding box stays within
	2% relative error of the reference SVG.

	Zone-id attributes matched via data-zone-id (reference) and data-room-id
	(generated). Per-dimension relative error is normalized by viewBox dimensions
	to handle different canvas sizes.

	Note: only checks zones present in BOTH SVGs. Zone count mismatches are
	tested separately in test_no_zone_dropped_or_added.
	"""
	# Skip if generator has not yet run
	if not os.path.exists(GENERATED_SVG):
		pytest.skip(f'{GENERATED_SVG} not yet generated')

	result = compare_ship_svg_bounds.compare_bounds(
		REFERENCE_SVG,
		GENERATED_SVG,
		tolerance=0.02,
	)

	assert len(result['out_of_tolerance_zones']) == 0, (
		f"Zone bounds exceed 2% tolerance. Out of tolerance zones: "
		f"{result['out_of_tolerance_zones']}. "
		f"Detail: " + json.dumps({
			zid: result['zones'][zid]['max_rel_error']
			for zid in result['out_of_tolerance_zones']
		}, indent=2)
	)


@pytest.mark.xfail(
	reason="Reference SVG has 10 zones; generated has 37 from design YAML expansion. "
	"Acceptable mismatch until reference is updated."
)
def test_no_zone_dropped_or_added():
	"""
	Verify that every zone in the reference SVG appears in the generated SVG,
	and vice versa.

	This test will FAIL initially because the reference has 10 hand-authored
	zones while the generated has 37 zones from the design YAML. This is
	expected and acceptable until the reference is updated to the full
	37-zone design.

	Marked xfail with a descriptive reason.
	"""
	# Skip if generator has not yet run
	if not os.path.exists(GENERATED_SVG):
		pytest.skip(f'{GENERATED_SVG} not yet generated')

	result = compare_ship_svg_bounds.compare_bounds(
		REFERENCE_SVG,
		GENERATED_SVG,
		tolerance=0.02,
	)

	# Check for dropped zones (in reference but not in generated)
	if result['ref_only_zones']:
		pytest.fail(f"Zones dropped from reference: {result['ref_only_zones']}")

	# Check for added zones (in generated but not in reference)
	if result['gen_only_zones']:
		pytest.fail(
			f"Zones added in generated (not in reference): "
			f"{result['gen_only_zones']}. "
			f"Reference has {len(result['zones'])} zones; "
			f"generated has {len(result['zones']) + len(result['gen_only_zones'])} zones."
		)
