# Minimal integration handoff (not applied to P0-owned files)

Prerequisites: school module commit plus identity commit b99b348; the latter supplies all five original avatars and the existing four-card presentation changes. Do not cherry-pick an older whole VisitorFarm/FriendsPanel file over P0.

## VisitorFarm: preserve current ordinary implementation verbatim

Add imports for `SchoolPlayground` and `SCHOOL_PLAYGROUND_FRIEND`. Extract the existing inline prop type to `VisitorFarmProps`. Rename only the existing exported function to `OrdinaryVisitorFarm`, leaving its body unchanged. Add an outer dispatch component:

```tsx
type VisitorFarmProps = {
  sampleId: string;
  onHome: () => void;
  onFriends: () => void;
  viewerKey?: string;
};
export function VisitorFarm(props: VisitorFarmProps) {
  return props.sampleId === SCHOOL_PLAYGROUND_FRIEND.target.sampleId
    ? <SchoolPlayground key={props.viewerKey} onHome={props.onHome}
        onFriends={props.onFriends} viewerKey={props.viewerKey}/>
    : <OrdinaryVisitorFarm {...props}/>;
}
```

Do not branch after calling ordinary sampleFarm/boarding hooks. School has no ordinary farm/boarding record. Existing parent home pause/inert/pending-command gate and return-to-home remain unchanged. Switching route component types disposes the old visitor.

## FriendsPanel: append one honest example

Import `SCHOOL_PLAYGROUND_FRIEND`; form `cards` from `[...SAMPLE_FRIENDS, SCHOOL_PLAYGROUND_FRIEND]`, retaining current sort. Add a school icon only as the theme-icon type fallback (actual avatar comes from identity input). The new card is `kind:'sample'`, `sampleId:'school-playground'`, badge示例, identityStatusunlinked-account; never pass it as a real UID.

Adapt the generic help sentence to mention that the school run team is observer-only while ordinary sample animals still support temporary interaction. Avoid saying every scene supports pickup or boarding. Do not add this ID to sampleFarm, SampleBoardingAdapter, server assets, or global map bounds.

## Required combined verification

- Actual MinimalApp + World: enter school via fifth card, home RAF stops and original camera/session stay intact; return resumes the same home instance with no save/outbox/localStorage mutation.
- Existing pending economic command rejects entry; hidden/blur/dialog and old P0 movement behavior remain unchanged.
- School→ordinary→school, viewer change, leave while run bytes pending; no stale reattachment and one active visitor renderer.
- Fifth avatar remains a display image, not real-account verification; all old four themes/ordinary boarding remain.
- Check public GLB exact hash, manifest pins and actual combined build. Independent review before main publishes.
