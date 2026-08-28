SHASHA MOTORS POS — COMPLETE
1. Run supabase_schema.sql in the same Supabase project.
2. Upload ALL files to GitHub repository root.
3. GitHub Pages: main branch / root.
4. Open the new Pages URL in Safari.
5. If an old Home Screen app exists, remove it and add the new site again.
6. Every sale is saved locally FIRST. Cloud failure does not cancel the sale.
7. Pending sales retry automatically every 30 seconds and when online.
8. More -> Sync Pending Sales forces a retry.
9. Existing localStorage keys are preserved: shasha_final_products_v1, shasha_final_sales_v1, shasha_final_invoice_v1.
IMPORTANT: the SQL policies intentionally allow anonymous browser access. For production multi-user use, add authentication and stricter RLS.
