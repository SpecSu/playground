# Garden invitation presentation

User screenshot identifies the upper-left avatar capsule. Replace its title with 贝壳的花园 and append an independent, accessible person-plus invitation control. Keep wardrobe/profile activation intact and keep the scene title unchanged.

The user explicitly requested a fast presentation-only flow, not real shared-state permissions or multiplayer. Use a lightweight invitation card in the existing tray, existing owner portrait and code-native plant/person icons, two short lines, native Share and copy-link actions. No new assets, dependencies or backend. Only the fixed public Site URL can be shared; no local storage, query, hash, owner ID, photos or credentials are serialized. No permission-granted/joined-success claim. Existing unrelated disclosures remain.

Native share cancellation is neutral. Unsupported native sharing falls back to clipboard; copy success appears only after the write resolves. The controller coalesces repeated activations and suppresses completion UI after closing/reopening a panel. Independent review plus real UI tests, lifecycle tests and full checks are required; parent owns publishing and supported-browser QA.
