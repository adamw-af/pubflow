# React Starter Kit (RSK)

A modern, production-ready SaaS starter template for building full-stack React applications using React Router v7, Convex, Clerk, and Polar.sh. Ready for Vercel deployment with built-in AI chat capabilities.

## Features

- 🚀 **React Router v7** - Modern full-stack React framework with SSR
- ⚡️ **Hot Module Replacement (HMR)** - Fast development experience
- 📦 **Asset bundling and optimization** - Production-ready builds
- 🔄 **Data loading and mutations** - Built-in loader/action patterns
- 🔒 **TypeScript by default** - Type safety throughout
- 🎨 **TailwindCSS v4** - Modern utility-first CSS
- 🔐 **Authentication with Clerk** - Complete user management
- 💳 **Subscription management with Polar.sh** - Billing and payments
- 🗄️ **Real-time database with Convex** - Serverless backend
- 🤖 **AI Chat Integration** - OpenAI-powered chat functionality
- 📊 **Interactive Dashboard** - User management and analytics
- 🎯 **Webhook handling** - Payment and subscription events
- 📱 **Responsive Design** - Mobile-first approach
- 🚢 **Vercel Deployment Ready** - One-click deployment

## Tech Stack

### Frontend
- **React Router v7** - Full-stack React framework
- **TailwindCSS v4** - Utility-first CSS framework
- **shadcn/ui** - Modern component library with Radix UI
- **Lucide React & Tabler Icons** - Beautiful icon libraries
- **Recharts** - Data visualization
- **Motion** - Smooth animations

### Backend & Services
- **Convex** - Real-time database and serverless functions
- **Clerk** - Authentication and user management
- **Polar.sh** - Subscription billing and payments
- **OpenAI** - AI chat capabilities

### Development & Deployment
- **Vite** - Fast build tool
- **TypeScript** - Type safety
- **Vercel** - Deployment platform

## Getting Started

### Prerequisites

- Node.js 18+ 
- Clerk account for authentication
- Convex account for database
- Polar.sh account for subscriptions
- OpenAI API key (for AI chat features)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment file and configure your credentials:

```bash
cp .env.example .env.local
```

3. Set up your environment variables in `.env.local`:

```bash
# Convex Configuration
CONVEX_DEPLOYMENT=your_convex_deployment_here
VITE_CONVEX_URL=your_convex_url_here

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here

# Polar.sh Configuration
POLAR_ACCESS_TOKEN=your_polar_access_token_here
POLAR_ORGANIZATION_ID=your_polar_organization_id_here
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret_here

# OpenAI Configuration (for AI chat)
OPENAI_API_KEY=your_openai_api_key_here

# Frontend URL for redirects
FRONTEND_URL=http://localhost:5173
```

4. Initialize Convex:

```bash
npx convex dev
```

5. Set up your Polar.sh webhook endpoint:
   - URL: `{your_domain}/webhook/polar`
   - Events: All subscription events

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Vercel Deployment (Recommended)

This starter kit is optimized for Vercel deployment with the `@vercel/react-router` preset:

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

The `react-router.config.ts` includes the Vercel preset for seamless deployment.

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Architecture

### Key Routes
- `/` - Homepage with pricing
- `/pricing` - Dynamic pricing page
- `/dashboard` - Protected user dashboard
- `/dashboard/chat` - AI-powered chat interface
- `/dashboard/settings` - User settings
- `/success` - Subscription success page
- `/webhook/polar` - Polar.sh webhook handler

### Key Components

#### Authentication & Authorization
- Protected routes with Clerk authentication
- Server-side user data loading with loaders
- Automatic user synchronization

#### Subscription Management
- Dynamic pricing cards fetched from Polar.sh
- Secure checkout flow with redirect handling
- Real-time subscription status updates
- Customer portal for subscription management
- Webhook handling for payment events

#### Dashboard Features
- Interactive sidebar navigation
- Real-time data updates
- User profile management
- AI chat functionality
- Subscription status display

#### AI Chat Integration
- OpenAI-powered conversations
- Real-time message streaming
- Chat history persistence
- Responsive chat interface

## Environment Variables

### Required for Production

- `CONVEX_DEPLOYMENT` - Your Convex deployment URL
- `VITE_CONVEX_URL` - Your Convex client URL
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `CLERK_SECRET_KEY` - Clerk secret key
- `POLAR_ACCESS_TOKEN` - Polar.sh API access token
- `POLAR_ORGANIZATION_ID` - Your Polar.sh organization ID
- `POLAR_WEBHOOK_SECRET` - Polar.sh webhook secret
- `OPENAI_API_KEY` - OpenAI API key for chat features
- `FRONTEND_URL` - Your production frontend URL

## Project Structure

```
├── app/
│   ├── components/         # Reusable UI components
│   │   ├── ui/            # shadcn/ui components
│   │   ├── homepage/      # Homepage sections
│   │   └── dashboard/     # Dashboard components
│   ├── routes/            # React Router routes
│   └── utils/             # Utility functions
├── convex/                # Convex backend functions
├── public/                # Static assets
└── docs/                  # Documentation
```

## Key Dependencies

- `react` & `react-dom` v19 - Latest React
- `react-router` v7 - Full-stack React framework
- `@clerk/react-router` - Authentication
- `convex` - Real-time database
- `@polar-sh/sdk` - Subscription management
- `@ai-sdk/openai` & `ai` - AI chat capabilities
- `@vercel/react-router` - Vercel deployment
- `tailwindcss` v4 - Styling
- `@radix-ui/*` - UI primitives

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript checks

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License.

---

**Stop rebuilding the same foundation over and over.** RSK eliminates months of integration work by providing a complete, production-ready SaaS template with authentication, payments, AI chat, and real-time data working seamlessly out of the box.

Built with ❤️ using React Router v7, Convex, Clerk, Polar.sh, and OpenAI.# pubflow
