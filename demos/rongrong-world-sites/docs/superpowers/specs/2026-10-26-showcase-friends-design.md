# Sample friends and isolated visits

The user explicitly authorized autonomous implementation after providing two reference screenshots. Keep this farm's visual identity: cream rounded friend drawer, Today/Week sample ranking, avatars, clear Sample badges and Visit buttons. A visit clearly names the host and always exposes Home.

Three curated example farms (forest, glacier harbor, desert oasis) use only released legacy animal models and current terrain/scenery. Each has six or fewer animals, connected routes, water/rest spots, and scenic areas, not random props. No new assets, generation, paid API, browser/GPU validation or publication.

Approaches considered: switching the canonical App's data is rejected because it risks storage/late-reply contamination; full navigation is rejected because it loses the home camera. Chosen builder decision: an independent VisitorFarm and in-memory VisitorSession plus a separate World. The existing home World remains mounted but paused and hidden, preserving camera and authoritative session. Parent integration owns MinimalApp.

Visitor commands are an allowlist (walk, lift, lower, greet) enforced in the session, not just UI. No sale, exchange, bag, terrain edit, breeding, wallet, reward or formal command transport. Ownership is fixed to the visited target. Greet is presentation-only, never the rewarding canonical care command. Home/switch/dispose invalidates epoch and releases carry; stale arrivals and reads cannot revive old interactions. Sample IDs never become real UIDs.

Boarding UI consumes BoardingTarget and the boarding owner's SampleBoardingAdapter. Demo eggs/coins stay in a separate per-user realm, with explicit demo/non-transferable labels. No duplicated real transaction service.

Tests: pure capabilities/isolation/reset/late replies, actual React and actual World CPU fixtures, bounded sample navigation and geometry. No claim of visual/GPU acceptance.
