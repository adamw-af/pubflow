/**
 * Clerk widget theming wired to PubFlow's design tokens (app.css).
 * Keeps the embedded SignIn/SignUp widgets on-brand with the rest of the app.
 */
export const clerkAppearance = {
  variables: {
    // Flow Green — the primary brand color (--flow-500).
    colorPrimary: "#0e8e6a",
    colorText: "#121317", // --ink-900
    colorTextSecondary: "#565b66", // --ink-500
    colorBackground: "#ffffff", // --paper-000
    colorInputBackground: "#ffffff",
    colorInputText: "#121317",
    borderRadius: "0.75rem", // --radius
    fontFamily:
      "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  elements: {
    // The page already provides the card chrome — let the widget sit flush.
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "shadow-none border-0 bg-transparent p-0",
    headerTitle: "text-2xl font-semibold tracking-tight",
    formButtonPrimary:
      "bg-[#0e8e6a] hover:bg-[#0b7458] text-white normal-case font-medium",
    footerActionLink: "text-[#0e8e6a] hover:text-[#0b7458]",
  },
} as const;
