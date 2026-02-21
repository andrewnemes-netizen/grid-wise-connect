

## Training Brochure for Gridwise Connect

### Approach

I'll build an in-app training guide page (`/training`) that serves as both a viewable reference and a downloadable PDF. The page will include annotated screenshots captured from the live app, structured into logical sections covering every feature.

### How Screenshots Will Work

Since I can capture screenshots of each page/feature directly from the app using browser tools, I'll:
1. Navigate to each key view and capture screenshots
2. Store them as base64 images embedded in the training page
3. Use them alongside descriptive text

For the **ChatGPT collaboration** you mentioned -- once the training page is built with screenshots and structure, you can easily copy the content or export the PDF and refine the wording in ChatGPT.

### Training Guide Structure

The brochure will cover these sections:

**1. Getting Started**
- Logging in
- Sidebar navigation (Map, Portfolio, LA Programme, Admin)
- User roles and what each can access

**2. Map View -- Core Navigation**
- Postcode search bar
- Basemap switcher (Street, Satellite, Light, Dark)
- Zoom controls and scale bar
- DNO filter dropdown
- Layer toggle panel (switching data layers on/off)
- Map legend
- Heatmap mode toggle

**3. Map Tools**
- Drop Pin -- click to assess a site location
- Boundary -- draw a site boundary polygon
- Connect -- draw a cable route between points
- Polygon Search -- search for assets within an area
- Measure -- measure distances on the map
- Clear All / Reset View buttons

**4. Site Intelligence Panel**
- What appears when you drop a pin
- Viability scoring (Green/Amber/Red)
- Grid readiness and deployment class
- Connection cost estimates
- Saving a site assessment
- Downloading a PDF report

**5. Connect Assessment**
- Drawing a cable route
- Undo/finish controls
- Route cost breakdown
- Comparison with saved assessments

**6. Portfolio**
- Viewing saved sites
- Filtering and sorting
- Comparing assessments
- Navigating to site detail

**7. Quick Estimate (Public)**
- Entering a postcode and proposed kW
- Understanding the result

**8. LA Programme (Internal)**
- CSV upload for batch scoring
- Programme dashboard

**9. Admin (Admin only)**
- Data upload
- Layer management
- Unit rate settings

### Technical Implementation

| Item | Detail |
|------|--------|
| New page | `src/pages/Training.tsx` |
| Route | `/training` (inside ProtectedRoute) |
| Sidebar entry | "Training" with BookOpen icon |
| Screenshot capture | Browser tool screenshots embedded as images |
| PDF export | "Download PDF" button using jsPDF (already installed) |
| Styling | Clean document layout with numbered sections, cards for each feature |

### Files to Create/Modify
- **Create** `src/pages/Training.tsx` -- the main training guide page with all content and embedded screenshots
- **Modify** `src/components/AppSidebar.tsx` -- add Training nav item
- **Modify** `src/App.tsx` -- add `/training` route

### Workflow
1. First, I'll capture screenshots by navigating through the app
2. Then build the Training page with embedded screenshots and descriptions
3. Add the route and sidebar link
4. Include a "Download as PDF" button for offline use

