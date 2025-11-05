# Vivid Vixen - Comprehensive Design Guidelines

## Design Approach
**User-Specified Aesthetic**: Dark theme with pink accents, cute UI with gradients and smooth animations. This application requires a visually striking, modern interface that balances playfulness with premium feel.

## Core Design Elements

### A. Typography
- **Primary Font**: Inter or DM Sans (Google Fonts) - clean, modern sans-serif
- **Headings**: 
  - H1: 2.5rem (40px), font-weight 700
  - H2: 2rem (32px), font-weight 600
  - H3: 1.5rem (24px), font-weight 600
- **Body Text**: 1rem (16px), font-weight 400, line-height 1.6
- **Small Text** (credits, labels): 0.875rem (14px), font-weight 500
- **Button Text**: 0.9375rem (15px), font-weight 600, letter-spacing 0.025em

### B. Layout System
**Spacing Units**: Tailwind spacing - primarily use units of 3, 4, 6, 8, 12, 16, 20, 24 for consistent rhythm
- Component padding: p-6 to p-8
- Section spacing: py-12 to py-16
- Card gaps: gap-6
- Button padding: px-6 py-3

**Grid Structure**:
- Max container width: max-w-7xl
- Dashboard cards: 2-column grid on desktop (grid-cols-2), single on mobile
- Generation tabs: Full-width content area with centered controls (max-w-2xl)

### C. Color Strategy (Dark Theme with Pink Accents)
While specific hex values will be defined later, establish these color roles:
- **Background Hierarchy**: Multiple layers of dark surfaces (deepest background, card surfaces, elevated elements)
- **Pink Accent Roles**: Primary CTAs, active states, credit indicators, subscription badges, focus states, progress indicators
- **Text Hierarchy**: Primary text (high contrast on dark), secondary text (medium contrast), tertiary/disabled text
- **Success/Error States**: Subtle tints that work with dark theme

### D. Component Library

#### Navigation
- **Top Navigation Bar**: Sticky header, height h-16, contains logo left, user menu right
- Logo area includes app name "Vivid Vixen" with subtle pink gradient on text
- User menu shows credit balance prominently with pink badge styling

#### Authentication Pages (Login/Signup)
- **Layout**: Centered card design, max-w-md
- Card styling: Elevated surface with subtle border, rounded-2xl, p-8
- Form inputs: Full-width, rounded-lg, consistent height h-12
- Input focus states: Pink accent border with subtle glow
- Primary CTA button: Full-width, pink gradient background, rounded-lg, h-12
- Secondary link: "Don't have an account?" / "Already have an account?" - pink accent on hover
- Smooth transition between login/signup views (fade + slide)

#### Dashboard Page
- **Hero Section**: Welcome message with username, prominent credit balance display
- Credit display: Large number with "Credits Available" label, pink gradient background badge
- **Action Cards Grid**: 2-column layout
  - Subscribe Card: Shows tier options (Basic $9.99 = 100 credits/month), pink gradient border on hover
  - Buy Credits Card: One-time purchase option ($10 = 100 credits), outlined style
- Each card: rounded-xl, p-6, icon at top, title, description, CTA button
- CTA buttons: Pink gradient for primary actions, outlined for secondary

#### Generation Page
- **Tab Navigation**: Horizontal tabs for "NSFW Image", "Video", "Upscale"
- Active tab: Pink accent bottom border (3px thick), pink text
- Inactive tabs: Muted text, hover state with subtle pink tint
- Smooth slide transition when switching tabs (transform + opacity)

**Per Tab Content**:
- Centered content area: max-w-2xl, mx-auto
- Prompt Input: Textarea, min-h-32, rounded-lg, placeholder text with creative examples
- File Upload Zone (Video/Upscale tabs): 
  - Dashed border area, rounded-lg, p-8
  - Upload icon centered, "Drag & drop or click to upload" text
  - Preview thumbnail after upload with remove button (X icon, top-right corner)
- Generate Button: 
  - Full-width, pink gradient, rounded-lg, h-12
  - Shows credit cost (e.g., "Generate (-1 credit)")
  - Loading state: Animated gradient shimmer + "Generating..." text
  - Disabled state when credits = 0

**Result Preview**:
- Fade-in animation (0.5s ease) when content appears
- Preview container: rounded-lg, aspect-ratio-video for videos, auto for images
- Download button below preview: Pink gradient, rounded-lg, with download icon

#### Modals & Popups
- **Low Credit Warning**: 
  - Centered overlay modal, max-w-sm
  - Pink warning icon at top
  - Message: "You need more credits to continue"
  - Two buttons: "Get Credits" (primary pink gradient) + "Cancel" (outlined)
  - Backdrop: Dark overlay with blur effect

### E. Animations & Interactions
- **Page Transitions**: Fade-in (300ms) on page load
- **Preview Appearances**: Fade + scale up (0.95 → 1.0) over 500ms
- **Button Hovers**: Scale 1.02, brightness increase, transition 200ms
- **Card Hovers**: Subtle lift with shadow, transform translateY(-2px)
- **Tab Switches**: Content cross-fade (300ms) + slight horizontal slide (20px)
- **Form Focus**: Input border color transition + subtle glow (300ms)
- **Loading States**: Smooth spinner or gradient shimmer animation
- All transitions: cubic-bezier(0.4, 0.0, 0.2, 1) for smooth, natural feel

### F. Responsive Behavior
- **Mobile (< 768px)**:
  - Single column layouts
  - Dashboard cards stack vertically
  - Tab labels shrink to icons + abbreviated text
  - Padding reduces: p-6 → p-4
  - Font sizes scale down 10-15%
- **Tablet (768px - 1024px)**:
  - Maintain 2-column dashboard
  - Full navigation visible
- **Desktop (> 1024px)**:
  - Max content width enforced
  - Generous spacing
  - Hover states fully interactive

### G. Special Design Features
- **Credit Balance Indicator**: Always visible in navigation, updates in real-time with smooth number count animation
- **Gradient Usage**: Pink gradients on primary buttons, active states, and accent elements (not overwhelming - strategic use)
- **Rounded Corners**: Consistent use of rounded-lg (buttons, inputs), rounded-xl (cards), rounded-2xl (modals)
- **Elevation System**: 3 levels - flat background, card surface (subtle shadow), elevated modal (stronger shadow)
- **Pink Accent Consistency**: Use throughout - buttons, links, badges, borders, loading indicators, success states

### H. Images
No hero images required for this application. The focus is on functional UI with the dark + pink aesthetic carrying visual interest. Icons throughout:
- Generation type icons in tabs
- Upload cloud icon in file upload zones
- Credit/subscription icons in dashboard cards
- User profile icon in navigation
- Download icon on result previews

Use icon library: **Heroicons** (outline style for most, solid for active states) - integrate via CDN