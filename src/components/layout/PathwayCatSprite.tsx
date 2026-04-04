import { useEffect, useMemo, useState } from "react";

type Tone = "dark" | "fur" | "light" | "eye" | "nose" | "mark" | "spark";

type PixelRect = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  tone: Tone;
};

type CatVariant = {
  id: string;
  palette: Record<Tone, string>;
  marks: PixelRect[];
};

type FrameId =
  | "idle"
  | "look-left"
  | "look-right"
  | "blink"
  | "paw"
  | "paw-high"
  | "sniff"
  | "sit"
  | "sit-blink"
  | "sit-tail"
  | "stretch"
  | "walk-right-a"
  | "walk-right-b"
  | "walk-left-a"
  | "walk-left-b"
  | "pounce-right"
  | "pounce-left";

type CatFrame = {
  pose?: PixelRect[];
  marks?: PixelRect[];
  eyes?: PixelRect[];
  tail?: PixelRect[];
  extras?: PixelRect[];
  useVariantMarks?: boolean;
};

type CatPersonality = {
  id: string;
  sequence: FrameId[];
};

const FRAME_INTERVAL_MS = 240;
const VIEWBOX_SIZE = 20;

const BASE_PIXELS: PixelRect[] = [
  { x: 6, y: 2, w: 2, tone: "dark" },
  { x: 5, y: 3, h: 2, tone: "dark" },
  { x: 8, y: 3, h: 2, tone: "dark" },
  { x: 12, y: 2, w: 2, tone: "dark" },
  { x: 12, y: 3, h: 2, tone: "dark" },
  { x: 15, y: 3, h: 2, tone: "dark" },
  { x: 6, y: 3, tone: "light" },
  { x: 13, y: 3, tone: "light" },
  { x: 6, y: 5, w: 8, tone: "dark" },
  { x: 4, y: 7, h: 2, tone: "dark" },
  { x: 5, y: 6, h: 4, tone: "dark" },
  { x: 14, y: 6, h: 4, tone: "dark" },
  { x: 15, y: 7, h: 2, tone: "dark" },
  { x: 6, y: 10, w: 8, tone: "dark" },
  { x: 6, y: 6, w: 8, tone: "fur" },
  { x: 5, y: 7, w: 10, h: 2, tone: "fur" },
  { x: 6, y: 9, w: 8, tone: "fur" },
  { x: 9, y: 8, w: 2, tone: "nose" },
  { x: 6, y: 11, w: 8, tone: "dark" },
  { x: 5, y: 12, h: 4, tone: "dark" },
  { x: 14, y: 12, h: 4, tone: "dark" },
  { x: 6, y: 16, w: 8, tone: "dark" },
  { x: 6, y: 12, w: 8, h: 4, tone: "fur" },
  { x: 8, y: 12, w: 4, h: 4, tone: "light" },
  { x: 6, y: 17, w: 3, tone: "dark" },
  { x: 11, y: 17, w: 3, tone: "dark" },
  { x: 7, y: 17, tone: "light" },
  { x: 12, y: 17, tone: "light" },
];

const OPEN_EYES: PixelRect[] = [
  { x: 7, y: 7, h: 2, tone: "eye" },
  { x: 12, y: 7, h: 2, tone: "eye" },
];

const BLINK_EYES: PixelRect[] = [
  { x: 7, y: 8, tone: "eye" },
  { x: 12, y: 8, tone: "eye" },
];

const LOOK_LEFT_EYES: PixelRect[] = [
  { x: 6, y: 7, h: 2, tone: "eye" },
  { x: 11, y: 7, h: 2, tone: "eye" },
];

const LOOK_RIGHT_EYES: PixelRect[] = [
  { x: 8, y: 7, h: 2, tone: "eye" },
  { x: 13, y: 7, h: 2, tone: "eye" },
];

const SNIFF_EYES: PixelRect[] = [
  { x: 7, y: 6, h: 2, tone: "eye" },
  { x: 12, y: 6, h: 2, tone: "eye" },
];

const TAIL_FRAMES: PixelRect[][] = [
  [
    { x: 15, y: 13, tone: "dark" },
    { x: 16, y: 12, tone: "dark" },
    { x: 17, y: 11, tone: "dark" },
    { x: 17, y: 10, tone: "mark" },
  ],
  [
    { x: 15, y: 12, tone: "dark" },
    { x: 16, y: 11, tone: "dark" },
    { x: 17, y: 10, tone: "dark" },
    { x: 18, y: 9, tone: "mark" },
  ],
  [
    { x: 15, y: 13, tone: "dark" },
    { x: 16, y: 12, tone: "dark" },
    { x: 17, y: 12, tone: "mark" },
    { x: 18, y: 13, tone: "mark" },
  ],
  [
    { x: 15, y: 14, tone: "dark" },
    { x: 16, y: 15, tone: "dark" },
    { x: 17, y: 15, tone: "mark" },
    { x: 18, y: 14, tone: "mark" },
  ],
];

const PAW_LIFT_PIXELS: PixelRect[] = [
  { x: 3, y: 10, tone: "dark" },
  { x: 4, y: 9, tone: "dark" },
  { x: 5, y: 9, tone: "fur" },
  { x: 4, y: 10, tone: "fur" },
  { x: 4, y: 11, tone: "fur" },
  { x: 3, y: 12, tone: "dark" },
  { x: 4, y: 12, tone: "fur" },
  { x: 5, y: 12, tone: "light" },
];

const PAW_HIGH_PIXELS: PixelRect[] = [
  { x: 3, y: 8, tone: "dark" },
  { x: 4, y: 7, tone: "dark" },
  { x: 5, y: 6, tone: "dark" },
  { x: 5, y: 7, tone: "fur" },
  { x: 5, y: 8, tone: "fur" },
  { x: 4, y: 9, tone: "fur" },
  { x: 3, y: 10, tone: "dark" },
  { x: 4, y: 10, tone: "fur" },
  { x: 2, y: 6, tone: "spark" },
  { x: 1, y: 7, tone: "spark" },
  { x: 2, y: 8, tone: "spark" },
];

const SNIFF_PIXELS: PixelRect[] = [
  { x: 9, y: 5, w: 2, tone: "spark" },
  { x: 8, y: 4, tone: "spark" },
  { x: 11, y: 4, tone: "spark" },
  { x: 9, y: 3, tone: "spark" },
  { x: 10, y: 2, tone: "spark" },
];

const SIT_PIXELS: PixelRect[] = [
  { x: 5, y: 13, tone: "fur" },
  { x: 14, y: 13, tone: "fur" },
  { x: 6, y: 14, w: 8, h: 2, tone: "fur" },
  { x: 8, y: 14, w: 4, h: 3, tone: "light" },
  { x: 5, y: 16, tone: "dark" },
  { x: 14, y: 16, tone: "dark" },
  { x: 15, y: 15, tone: "dark" },
  { x: 16, y: 14, tone: "dark" },
  { x: 16, y: 13, tone: "mark" },
  { x: 15, y: 12, tone: "mark" },
];

const SIT_TAIL_PIXELS: PixelRect[] = [
  { x: 5, y: 13, tone: "fur" },
  { x: 14, y: 13, tone: "fur" },
  { x: 6, y: 14, w: 8, h: 2, tone: "fur" },
  { x: 8, y: 14, w: 4, h: 3, tone: "light" },
  { x: 5, y: 16, tone: "dark" },
  { x: 14, y: 16, tone: "dark" },
  { x: 15, y: 14, tone: "dark" },
  { x: 16, y: 13, tone: "dark" },
  { x: 17, y: 12, tone: "mark" },
  { x: 17, y: 11, tone: "mark" },
];

const STRETCH_PIXELS: PixelRect[] = [
  { x: 5, y: 2, tone: "dark" },
  { x: 14, y: 2, tone: "dark" },
  { x: 4, y: 8, tone: "dark" },
  { x: 15, y: 8, tone: "dark" },
  { x: 3, y: 9, w: 2, tone: "mark" },
  { x: 15, y: 9, w: 2, tone: "mark" },
  { x: 6, y: 17, w: 4, tone: "light" },
  { x: 10, y: 17, w: 4, tone: "light" },
];

const WALK_RIGHT_A_POSE: PixelRect[] = [
  { x: 8, y: 2, tone: "dark" },
  { x: 9, y: 1, tone: "dark" },
  { x: 10, y: 2, tone: "dark" },
  { x: 7, y: 3, w: 5, tone: "dark" },
  { x: 6, y: 4, w: 7, h: 4, tone: "dark" },
  { x: 7, y: 4, w: 5, h: 3, tone: "fur" },
  { x: 8, y: 7, w: 4, tone: "fur" },
  { x: 12, y: 5, tone: "eye" },
  { x: 13, y: 6, tone: "nose" },
  { x: 8, y: 8, w: 2, tone: "mark" },
  { x: 6, y: 8, w: 7, tone: "dark" },
  { x: 5, y: 9, w: 8, h: 5, tone: "dark" },
  { x: 6, y: 9, w: 6, h: 4, tone: "fur" },
  { x: 7, y: 10, w: 3, h: 3, tone: "light" },
  { x: 4, y: 10, tone: "dark" },
  { x: 3, y: 9, tone: "dark" },
  { x: 2, y: 8, tone: "mark" },
  { x: 6, y: 14, h: 3, tone: "dark" },
  { x: 7, y: 14, h: 2, tone: "fur" },
  { x: 7, y: 16, tone: "light" },
  { x: 10, y: 13, h: 4, tone: "dark" },
  { x: 11, y: 13, h: 3, tone: "fur" },
  { x: 11, y: 16, tone: "light" },
];

const WALK_RIGHT_B_POSE: PixelRect[] = [
  { x: 8, y: 2, tone: "dark" },
  { x: 9, y: 1, tone: "dark" },
  { x: 10, y: 2, tone: "dark" },
  { x: 7, y: 3, w: 5, tone: "dark" },
  { x: 6, y: 4, w: 7, h: 4, tone: "dark" },
  { x: 7, y: 4, w: 5, h: 3, tone: "fur" },
  { x: 8, y: 7, w: 4, tone: "fur" },
  { x: 12, y: 5, tone: "eye" },
  { x: 13, y: 6, tone: "nose" },
  { x: 9, y: 9, w: 2, tone: "mark" },
  { x: 6, y: 8, w: 7, tone: "dark" },
  { x: 5, y: 9, w: 8, h: 5, tone: "dark" },
  { x: 6, y: 9, w: 6, h: 4, tone: "fur" },
  { x: 7, y: 10, w: 3, h: 3, tone: "light" },
  { x: 4, y: 9, tone: "dark" },
  { x: 3, y: 8, tone: "dark" },
  { x: 2, y: 7, tone: "mark" },
  { x: 7, y: 13, h: 4, tone: "dark" },
  { x: 8, y: 13, h: 3, tone: "fur" },
  { x: 8, y: 16, tone: "light" },
  { x: 11, y: 14, h: 3, tone: "dark" },
  { x: 12, y: 14, h: 2, tone: "fur" },
  { x: 12, y: 16, tone: "light" },
];

const POUNCE_RIGHT_POSE: PixelRect[] = [
  { x: 11, y: 3, tone: "dark" },
  { x: 12, y: 2, tone: "dark" },
  { x: 13, y: 3, tone: "dark" },
  { x: 10, y: 4, w: 5, h: 3, tone: "dark" },
  { x: 11, y: 4, w: 3, h: 2, tone: "fur" },
  { x: 13, y: 5, tone: "eye" },
  { x: 15, y: 6, tone: "nose" },
  { x: 9, y: 7, w: 5, tone: "dark" },
  { x: 6, y: 8, w: 8, h: 4, tone: "dark" },
  { x: 7, y: 8, w: 6, h: 3, tone: "fur" },
  { x: 8, y: 9, w: 3, h: 2, tone: "light" },
  { x: 9, y: 11, w: 2, tone: "mark" },
  { x: 5, y: 9, tone: "dark" },
  { x: 4, y: 8, tone: "dark" },
  { x: 3, y: 7, tone: "mark" },
  { x: 6, y: 12, h: 3, tone: "dark" },
  { x: 7, y: 12, h: 2, tone: "fur" },
  { x: 11, y: 11, w: 4, tone: "dark" },
  { x: 12, y: 12, w: 4, tone: "fur" },
  { x: 15, y: 12, tone: "light" },
  { x: 16, y: 11, tone: "spark" },
  { x: 17, y: 10, tone: "spark" },
];

function mirrorRects(rects: PixelRect[]) {
  return rects.map((rect) => ({
    ...rect,
    x: VIEWBOX_SIZE - rect.x - (rect.w ?? 1),
  }));
}

const WALK_LEFT_A_POSE = mirrorRects(WALK_RIGHT_A_POSE);
const WALK_LEFT_B_POSE = mirrorRects(WALK_RIGHT_B_POSE);
const POUNCE_LEFT_POSE = mirrorRects(POUNCE_RIGHT_POSE);

const CAT_VARIANTS: CatVariant[] = [
  {
    id: "marmalade",
    palette: {
      dark: "#3c2518",
      fur: "#ea8e38",
      light: "#fff1da",
      eye: "#2b1b12",
      nose: "#f6afc2",
      mark: "#cf6f21",
      spark: "#d99d31",
    },
    marks: [
      { x: 9, y: 6, tone: "mark" },
      { x: 11, y: 6, tone: "mark" },
      { x: 7, y: 13, tone: "mark" },
      { x: 12, y: 13, tone: "mark" },
      { x: 7, y: 15, tone: "mark" },
      { x: 12, y: 15, tone: "mark" },
    ],
  },
  {
    id: "bluebell",
    palette: {
      dark: "#324a64",
      fur: "#7fa6cf",
      light: "#eef5ff",
      eye: "#1f3043",
      nose: "#efadc4",
      mark: "#5c81a8",
      spark: "#d9a54b",
    },
    marks: [
      { x: 8, y: 6, tone: "mark" },
      { x: 12, y: 6, tone: "mark" },
      { x: 7, y: 12, tone: "mark" },
      { x: 12, y: 14, tone: "mark" },
    ],
  },
  {
    id: "tux",
    palette: {
      dark: "#111117",
      fur: "#2a2d34",
      light: "#fffaf1",
      eye: "#f0c65e",
      nose: "#f1a2c1",
      mark: "#4a4f5d",
      spark: "#f0c65e",
    },
    marks: [
      { x: 8, y: 6, tone: "mark" },
      { x: 12, y: 6, tone: "mark" },
      { x: 6, y: 13, tone: "mark" },
      { x: 13, y: 13, tone: "mark" },
    ],
  },
  {
    id: "calico",
    palette: {
      dark: "#382820",
      fur: "#fff8f2",
      light: "#fff4e6",
      eye: "#322119",
      nose: "#f3a9be",
      mark: "#ef973a",
      spark: "#e7b14a",
    },
    marks: [
      { x: 6, y: 5, w: 2, tone: "mark" },
      { x: 6, y: 6, w: 3, tone: "mark" },
      { x: 12, y: 7, w: 2, tone: "mark" },
      { x: 6, y: 13, w: 2, tone: "mark" },
      { x: 12, y: 14, w: 2, tone: "mark" },
    ],
  },
];

const CAT_FRAMES: Record<FrameId, CatFrame> = {
  idle: {
    eyes: OPEN_EYES,
    tail: TAIL_FRAMES[0],
  },
  "look-left": {
    eyes: LOOK_LEFT_EYES,
    tail: TAIL_FRAMES[1],
  },
  "look-right": {
    eyes: LOOK_RIGHT_EYES,
    tail: TAIL_FRAMES[3],
  },
  blink: {
    eyes: BLINK_EYES,
    tail: TAIL_FRAMES[2],
  },
  paw: {
    eyes: LOOK_LEFT_EYES,
    tail: TAIL_FRAMES[1],
    extras: PAW_LIFT_PIXELS,
  },
  "paw-high": {
    eyes: LOOK_LEFT_EYES,
    tail: TAIL_FRAMES[1],
    extras: PAW_HIGH_PIXELS,
  },
  sniff: {
    eyes: SNIFF_EYES,
    tail: TAIL_FRAMES[0],
    extras: SNIFF_PIXELS,
  },
  sit: {
    eyes: OPEN_EYES,
    tail: TAIL_FRAMES[3],
    extras: SIT_PIXELS,
  },
  "sit-blink": {
    eyes: BLINK_EYES,
    tail: TAIL_FRAMES[3],
    extras: SIT_PIXELS,
  },
  "sit-tail": {
    eyes: OPEN_EYES,
    tail: TAIL_FRAMES[1],
    extras: SIT_TAIL_PIXELS,
  },
  stretch: {
    eyes: LOOK_RIGHT_EYES,
    tail: TAIL_FRAMES[2],
    extras: STRETCH_PIXELS,
  },
  "walk-right-a": {
    pose: WALK_RIGHT_A_POSE,
    useVariantMarks: false,
  },
  "walk-right-b": {
    pose: WALK_RIGHT_B_POSE,
    useVariantMarks: false,
  },
  "walk-left-a": {
    pose: WALK_LEFT_A_POSE,
    useVariantMarks: false,
  },
  "walk-left-b": {
    pose: WALK_LEFT_B_POSE,
    useVariantMarks: false,
  },
  "pounce-right": {
    pose: POUNCE_RIGHT_POSE,
    useVariantMarks: false,
  },
  "pounce-left": {
    pose: POUNCE_LEFT_POSE,
    useVariantMarks: false,
  },
};

function repeatFrame(frame: FrameId, count: number) {
  return Array.from({ length: count }, () => frame);
}

function repeatCycle(frames: FrameId[], count: number) {
  return Array.from(
    { length: frames.length * count },
    (_, index) => frames[index % frames.length],
  );
}

const CAT_PERSONALITIES: CatPersonality[] = [
  {
    id: "scout",
    sequence: [
      ...repeatFrame("sit", 2),
      "sit-blink",
      "idle",
      "sniff",
      "look-right",
      ...repeatCycle(["walk-right-a", "walk-right-b"], 4),
      "pounce-right",
      "pounce-right",
      "paw-high",
      "idle",
      "blink",
      "sit-tail",
      "sit",
      "look-left",
      ...repeatCycle(["walk-left-a", "walk-left-b"], 4),
      "pounce-left",
      "pounce-left",
      "paw",
      "idle",
      "blink",
      "sit",
      "sit-tail",
      "sit-blink",
      "stretch",
      "idle",
    ],
  },
  {
    id: "cozy",
    sequence: [
      ...repeatFrame("sit", 3),
      "sit-tail",
      "sit-blink",
      "idle",
      "look-left",
      "sniff",
      ...repeatCycle(["walk-right-a", "walk-right-b"], 2),
      "idle",
      "blink",
      "paw",
      "idle",
      ...repeatFrame("sit", 3),
      "sit-tail",
      "sit-blink",
      "stretch",
      "idle",
      "look-right",
      ...repeatCycle(["walk-left-a", "walk-left-b"], 2),
      "idle",
      "blink",
      ...repeatFrame("sit", 2),
      "sit-tail",
      "sit-blink",
      "idle",
      "sniff",
      "idle",
    ],
  },
  {
    id: "gremlin",
    sequence: [
      "idle",
      "blink",
      "paw",
      "paw-high",
      "sniff",
      "look-right",
      ...repeatCycle(["walk-right-a", "walk-right-b"], 3),
      "pounce-right",
      "paw-high",
      "blink",
      "idle",
      "sit-tail",
      "sit",
      "look-left",
      ...repeatCycle(["walk-left-a", "walk-left-b"], 3),
      "pounce-left",
      "paw",
      "blink",
      "stretch",
      "idle",
      "sit",
      "sit-blink",
      "idle",
      "sniff",
      "idle",
    ],
  },
];

type CatPersonalityId = (typeof CAT_PERSONALITIES)[number]["id"];

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function renderPixelRects(
  rects: PixelRect[],
  palette: Record<Tone, string>,
  keyPrefix: string,
) {
  return rects.map((rect) => (
    <rect
      key={`${keyPrefix}-${rect.tone}-${rect.x}-${rect.y}-${rect.w ?? 1}-${rect.h ?? 1}`}
      x={rect.x}
      y={rect.y}
      width={rect.w ?? 1}
      height={rect.h ?? 1}
      fill={palette[rect.tone]}
    />
  ));
}

export function PathwayCatSprite({
  seed,
  className,
  personality,
}: {
  seed: string;
  className?: string;
  personality?: CatPersonalityId;
}) {
  const [sequenceIndex, setSequenceIndex] = useState(0);

  const seedHash = useMemo(() => hashSeed(seed), [seed]);

  const variant = useMemo(() => {
    return CAT_VARIANTS[seedHash % CAT_VARIANTS.length];
  }, [seedHash]);

  const resolvedPersonality = useMemo(() => {
    if (personality) {
      return (
        CAT_PERSONALITIES.find((candidate) => candidate.id === personality) ??
        CAT_PERSONALITIES[0]
      );
    }

    const personalityIndex =
      Math.floor(seedHash / CAT_VARIANTS.length) % CAT_PERSONALITIES.length;
    return CAT_PERSONALITIES[personalityIndex];
  }, [personality, seedHash]);

  useEffect(() => {
    if (resolvedPersonality.sequence.length === 0) return;
    setSequenceIndex(0);
  }, [resolvedPersonality.sequence]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSequenceIndex(
        (current) => (current + 1) % resolvedPersonality.sequence.length,
      );
    }, FRAME_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [resolvedPersonality.sequence.length]);

  const frame = CAT_FRAMES[resolvedPersonality.sequence[sequenceIndex]];
  const pose = frame.pose ?? BASE_PIXELS;
  const marks = frame.pose
    ? (frame.marks ?? [])
    : frame.useVariantMarks === false
      ? (frame.marks ?? [])
      : variant.marks;
  const eyes = frame.pose ? (frame.eyes ?? []) : (frame.eyes ?? OPEN_EYES);
  const tail = frame.pose ? (frame.tail ?? []) : (frame.tail ?? TAIL_FRAMES[0]);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      data-personality={resolvedPersonality.id}
    >
      {renderPixelRects(pose, variant.palette, "pose")}
      {renderPixelRects(marks, variant.palette, "marks")}
      {renderPixelRects(eyes, variant.palette, "eyes")}
      {renderPixelRects(tail, variant.palette, "tail")}
      {frame.extras
        ? renderPixelRects(frame.extras, variant.palette, "extras")
        : null}
    </svg>
  );
}
