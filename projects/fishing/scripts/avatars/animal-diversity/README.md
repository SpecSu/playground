# Species anatomy cast

The five animal IDs keep their protocol identity, but no longer share a resized humanoid body. Revision `species-anatomy-v3` is original code-authored geometry with vertex-color vinyl materials, inspired by the supplied character reference direction.

- **Cat:** compact round body, large cheeky head, short limbs and articulated curling tail.
- **Frog:** wide low torso, splayed haunches, hanging forelimbs, web-like spread toes and a tired downturned face.
- **Dog:** narrow body, long legs and neck, extended muzzle, independently articulated hanging ears and tail.
- **Capybara:** horizontal barrel, four short legs, broad blunt head and unbothered expression. Arm chains are front legs; leg chains are rear legs.
- **Panda:** heavy pear body, short legs, broad head, continuous white/black painted torso and deadpan eyes.

## Reproduction

Run from the repository with Blender 4.3.2:

```sh
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/animal-diversity/generate_animals.py -- --output-dir /absolute/path/to/review
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/animal-diversity/render_review.py -- --asset-dir /absolute/path/to/review --mode species-three-quarter --samples 64
```

Generation refuses the shipping avatar directory. Inspect exported GLBs before deliberately copying the five GLBs and merging their manifest entries. It never invokes or overwrites the human, monster or cockatoo generators/assets. Original uploaded references remain outside the repository and are not published.

## Rig and safety contract

`rig-spec.json` records authoring pivots in `(right, height, forward)` coordinates. Canonical 18 joint names and their axis convention remain compatible. Blender bones all have +Z tails, so their exported local rotation basis matches the previous cast. Capybara alone applies the documented export transform to all geometry and non-root joints: `forward = (authoringForward - 0.167) * 0.87`. This centers the complete solid barrel/head on the navigation root rather than leaving a long head overhang.

Armature extras identify `speciesRig = quadruped` for capybara and `animal-v2` for the others. The unchanged hierarchy lets capybara's `upperArm/forearm/hand` chains become front contacts. All four sole pivots are close to the common floor plane. Cat and dog add real weighted `tail`/`tailTip` chains; dog adds weighted `ear_L`/`ear_R` bones. Optional capybara headphones keep the historical `role = dj` accessory marker, but the dedicated resident DJ is still the unchanged cockatoo.

Animation and locomotion are implemented by the existing runtime adapter. Species anatomy does not alter navigation, network IDs, server movement authority, the 0.65 m physical body radius, or the 1 m full animated envelope. Independent posed-vertex QA confirmed the centered capybara solid head/body radius at about 0.642 m and no booth penetration across the tested approach directions.

Each animal stays below the existing 14,000-triangle budget and below 0.5 MB. Animals need two opaque material draws, or three for capybara including its optional headphones. Skin weights blend over articulated joints. Geometry is authored at the intended budget rather than run through a silhouette-changing decimator. Manifest hashes and exact counts are recorded in `public/avatars/manifest.json`.
