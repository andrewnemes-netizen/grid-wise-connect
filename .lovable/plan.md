

## Add Visual Screenshots to Training Guide

### The Challenge
The app requires authentication, so automated screenshot capture isn't possible from the AI browser. We need an alternative approach to add visuals.

### Recommended Approach: AI-Generated Illustration Images

I'll use Lovable AI's image generation (Gemini model) to create clean, annotated UI mockup illustrations for each section of the training guide. These will be professional diagram-style images showing the key UI elements with callouts and labels.

### What Will Be Generated (9 images)

1. **Login Screen** -- Annotated view of the auth page with email/password fields
2. **Map View Overview** -- Bird's-eye layout showing search bar, basemap switcher, layer panel, legend positions
3. **Map Toolbar** -- Close-up of the tool buttons with labels (Pin, Boundary, Connect, Polygon, Measure)
4. **Site Intelligence Panel** -- Mock of the panel showing viability score, grid readiness, cost estimate sections
5. **Connect Assessment** -- Illustration of a cable route with cost breakdown panel
6. **Portfolio Table** -- Mock table view with filters, columns, and action buttons
7. **Quick Estimate** -- Simple form with postcode and kW input fields
8. **LA Programme Dashboard** -- CSV upload area and dashboard charts
9. **Admin Panel** -- Layer management table and unit rate settings

### Technical Implementation

| Step | Detail |
|------|--------|
| Create edge function | `generate-training-images` -- calls AI image generation for each section |
| Store images | Save generated images to a Lovable Cloud storage bucket |
| Update Training.tsx | Add image components between section header and content cards |
| Fallback | Graceful placeholder if images haven't loaded yet |
| Caching | Images generated once and stored permanently, not regenerated on each page load |

### Files to Create/Modify

- **Create** `supabase/functions/generate-training-images/index.ts` -- Edge function to generate and store images
- **Create** Storage bucket `training-images` for persistent image storage
- **Modify** `src/pages/Training.tsx` -- Add image display for each section, with a "Generate Screenshots" admin button and loading states

### How It Works

1. An admin clicks "Generate Visual Guides" button on the training page
2. The edge function calls the AI image model to create annotated UI illustrations for each section
3. Images are saved to cloud storage
4. The training page loads images from storage and displays them inline with each section
5. PDF export will also include the images

### Alternative: Manual Screenshots

If you'd prefer real screenshots instead of AI illustrations:
- You can take screenshots yourself from your browser
- Upload them via the Admin data upload area or share them here
- I'll embed them into the training page

This hybrid approach means we can get a visual guide working immediately with AI illustrations, and you can replace individual images with real screenshots later if needed.

