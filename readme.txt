SHASHA MOTORS POS — FIXED VERSION

Files:
- index.html
- app.js
- supabase_schema.sql
- manifest.json

IMPORTANT:
1. First run the COMPLETE `supabase_schema.sql` in Supabase SQL Editor.
2. Do NOT delete the existing products table/data.
3. Then upload all files to the GitHub repository ROOT (same level as index.html).
4. GitHub Pages should publish index.html.
5. Open the POS and tap More -> Refresh Products.
6. The status should say: Supabase database connected ✓

The new app tests Supabase with a normal SELECT instead of the old head/count check and shows the actual database error if something is wrong.
Sales use the `pos_complete_sale` RPC for an atomic cloud transaction. If the RPC has not been installed yet, the app has a fallback sequence.
