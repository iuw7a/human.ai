/**
 * Templates for the image model (humi.1 images).
 *
 * Only text-to-image is supported today: every template is a prompt, nothing
 * else. The card art is drawn with CSS gradients — it is a *style preview*,
 * not a generated sample, so nothing here pretends to be a real result.
 *
 * Every palette stays inside the brand's warm range (red / amber / charcoal)
 * and `height` differs on purpose: the grid reads as a masonry wall like the
 * reference, without loading a single image file.
 */

export type ImagineMotif = "orb" | "band" | "dots" | "arch" | "blobs";

export interface ImagineTemplate {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  from: string;
  to: string;
  motif: ImagineMotif;
  height: number;
}

export const IMAGINE_TEMPLATES: ImagineTemplate[] = [
  {
    id: "product",
    label: "Product shot",
    hint: "Studio, soft light",
    prompt:
      "A minimalist product photo of a matte drink can standing on concrete, soft studio light from the left, long shadow, shallow depth of field, hyperrealistic, 4k",
    from: "#8c2f2f",
    to: "#2a1414",
    motif: "orb",
    height: 210,
  },
  {
    id: "portrait",
    label: "Portrait",
    hint: "Golden hour, 85mm",
    prompt:
      "A natural portrait of a person in warm golden hour light, 85mm lens, shallow depth of field, soft skin tones, looking slightly off camera",
    from: "#5c2f2f",
    to: "#241010",
    motif: "blobs",
    height: 260,
  },
  {
    id: "closeup",
    label: "Close-up",
    hint: "Macro detail",
    prompt:
      "A close-up macro shot of a blooming flower with dew drops, soft background bokeh, crisp detail, natural light",
    from: "#6b3318",
    to: "#221208",
    motif: "arch",
    height: 180,
  },
  {
    id: "poster",
    label: "Poster",
    hint: "Space for a headline",
    prompt:
      "A bold retro poster with large empty space for a headline, muted warm two-tone colour scheme, subtle paper grain, flat graphic style",
    from: "#2a1f1c",
    to: "#0f0b0a",
    motif: "band",
    height: 235,
  },
  {
    id: "logo",
    label: "Logo",
    hint: "Flat vector, 2 colours",
    prompt:
      "A minimalist vector logo mark for a coffee brand, flat shapes, two colours only, balanced geometry, plain white background",
    from: "#4a3323",
    to: "#1c130c",
    motif: "dots",
    height: 165,
  },
  {
    id: "sticker",
    label: "Sticker",
    hint: "Cartoon, thick outline",
    prompt:
      "A playful cartoon sticker of a cat wearing sunglasses, thick clean outline, flat saturated colours, die-cut look, plain background",
    from: "#7a3b1e",
    to: "#2a1409",
    motif: "blobs",
    height: 195,
  },
  {
    id: "watercolor",
    label: "Watercolor",
    hint: "Soft washes",
    prompt:
      "A watercolour painting of a mountain range in morning fog, soft warm washes, visible paper texture, loose brush strokes",
    from: "#5a3020",
    to: "#20100a",
    motif: "arch",
    height: 230,
  },
  {
    id: "render3d",
    label: "3D render",
    hint: "Studio, octane look",
    prompt:
      "A 3D render of an abstract glossy red sphere on a dark background, soft studio lighting, subtle reflections, high detail",
    from: "#4a2430",
    to: "#160b10",
    motif: "orb",
    height: 175,
  },
  {
    id: "food",
    label: "Food",
    hint: "Close-up, warm",
    prompt:
      "A close-up food photo of a chocolate cake with fresh berries, warm side light, crumbs and texture visible, appetising, shallow depth of field",
    from: "#5c4426",
    to: "#221a10",
    motif: "blobs",
    height: 215,
  },
  {
    id: "landscape",
    label: "Landscape",
    hint: "Wide, cinematic",
    prompt:
      "A wide desert landscape at sunset, long shadows, dust in the air, cinematic warm colour grading, panoramic composition",
    from: "#6b4a2a",
    to: "#221709",
    motif: "band",
    height: 150,
  },
  {
    id: "night",
    label: "Night city",
    hint: "Rain, warm neon",
    prompt:
      "A rain-soaked street at night with warm neon signs, reflections in the wet asphalt, dense city atmosphere, cinematic",
    from: "#452024",
    to: "#170a0c",
    motif: "dots",
    height: 240,
  },
  {
    id: "icon",
    label: "Icon",
    hint: "Simple, single idea",
    prompt:
      "A simple app icon with one clear idea, soft warm gradient background, subtle depth, rounded square, no text",
    from: "#3a2f2a",
    to: "#141010",
    motif: "arch",
    height: 160,
  },
];

/**
 * Editing features from the reference layout that this app does NOT have yet.
 * They are rendered greyed out and unclickable — never as working templates.
 */
export const IMAGINE_EDITING_PENDING: { id: string; label: string }[] = [
  { id: "edit-text", label: "Edit text in image" },
  { id: "precise-edit", label: "Precise edit" },
  { id: "remove-bg", label: "Remove background" },
  { id: "upscale", label: "Upscale & resize" },
];
