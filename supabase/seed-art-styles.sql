-- Curated art-style catalog for V2 creation flow.
-- Re-runnable: upserts on (id).
--
-- Sample images live under public/art-style-samples/<id>.webp and are
-- served at /art-style-samples/<id>.webp by Next.js's public/ asset
-- handling. The seed stores the relative URL; the UI uses it as-is in
-- an <img src=...> tag.

insert into public.art_styles (id, display_name, description, prompt_scaffold, sample_image_urls, sort_order, is_active)
values
  ('whimsy_watercolor',  'Whimsy Watercolor',  'Soft, dreamy watercolor with hand-drawn line work.',
    'illustrated in soft watercolor with gentle washes of color, hand-drawn line work, dreamy lighting, painterly texture',
    array['/art-style-samples/whimsy_watercolor.webp'], 1, true),
  ('whiteboard_crayon',  'Whiteboard Crayon',  'Energetic crayon-on-paper with bold outlines.',
    'crayon-style illustration on white paper, bold colored outlines, slightly textured strokes, playful energy',
    array['/art-style-samples/whiteboard_crayon.webp'], 2, true),
  ('sketch_magic',       'Sketch Magic',       'Lightly shaded pencil sketch with hints of color.',
    'pencil sketch illustration, soft graphite shading, light hand-applied color washes, storybook quality',
    array['/art-style-samples/sketch_magic.webp'], 3, true),
  ('superhero_comic',    'Superhero Comic',    'Punchy comic-book panels with bold ink and color blocks.',
    'comic book illustration, bold ink outlines, flat saturated color, halftone shading, dynamic poses',
    array['/art-style-samples/superhero_comic.webp'], 4, true),
  ('cartoon_adventure',  'Cartoon Adventure',  'Bright animated-cartoon style with rounded shapes.',
    'cheerful animated cartoon illustration, rounded forms, bright saturated palette, soft cel shading',
    array['/art-style-samples/cartoon_adventure.webp'], 5, true),
  ('color_paper_cutouts','Color Paper Cutouts','Layered cut-paper collage with visible paper textures.',
    'cut-paper collage illustration, layered construction paper with visible texture, simple silhouettes, gentle shadows',
    array['/art-style-samples/color_paper_cutouts.webp'], 6, true),
  ('folk_tale_storybook','Folk Tale Storybook','Stylized folk-art prints with rich pattern work.',
    'folk-art storybook illustration, ornamental patterns, rich earthy palette, flat stylized figures',
    array['/art-style-samples/folk_tale_storybook.webp'], 7, true),
  ('studio_ghibli',      'Studio Ghibli',      'Hand-painted anime backgrounds with magical realism.',
    'hand-painted illustration in the style of classic Japanese animated films, atmospheric lighting, painterly backgrounds, gentle realism',
    array['/art-style-samples/studio_ghibli.webp'], 8, true),
  ('soft_romantic',      'Soft Romantic',      'Pastel, blushy romantic illustration.',
    'soft romantic illustration, blush and pastel palette, gentle linework, decorative hearts and florals',
    array['/art-style-samples/soft_romantic.webp'], 9, true)
on conflict (id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  prompt_scaffold = excluded.prompt_scaffold,
  sample_image_urls = excluded.sample_image_urls,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
