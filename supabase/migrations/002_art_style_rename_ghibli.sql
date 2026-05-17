-- Rename the public-facing label of the `studio_ghibli` art style row.
-- "Studio Ghibli" is a registered trademark; using it as a product-visible
-- style name invites a takedown notice. The DB id stays `studio_ghibli`
-- so existing FKs from stories.art_style_id keep working — only the
-- display_name shown to users in the wizard's art-style picker changes.
--
-- The internal Gemini prompt that drives the visual style is unchanged;
-- it's never shown to users.
update public.art_styles
   set display_name = 'Soft Anime Landscapes'
 where id = 'studio_ghibli'
   and display_name = 'Studio Ghibli';
