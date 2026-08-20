import { TanStackDevtools } from "@tanstack/react-devtools"
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { ApiProvider } from "../lib/api"
import { getConfig } from "../lib/config"
import { LIGHT_VARS, STORAGE_KEY, ThemeProvider } from "../lib/theme"
import { ToastProvider } from "../lib/toast"
import appCss from "../styles.css?url"

// Serialize the server's runtime config into the SSR HTML so the browser reads
// its API/PowerSync URLs from window.__PACE_CONFIG__ instead of the build-time
// bundle — letting one image serve every environment. Escape "<" so a URL can't
// break out of the <script>. On the client this re-reads the same injected
// object, so it hydrates without a mismatch.
function ConfigScript() {
  const json = JSON.stringify(getConfig()).replace(/</g, "\\u003c")
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-injected runtime config, escaped above
      dangerouslySetInnerHTML={{ __html: `window.__PACE_CONFIG__=${json}` }}
    />
  )
}

// Apply the stored theme's CSS vars to <html> BEFORE hydration and first paint, so a
// user who picked light mode never sees a flash of the default dark theme. Mirrors the
// runtime ThemeProvider, sharing LIGHT_VARS/STORAGE_KEY so the two can't drift.
function ThemeScript() {
  const vars = JSON.stringify(LIGHT_VARS).replace(/</g, "\\u003c")
  const key = JSON.stringify(STORAGE_KEY)
  const js = `(function(){try{var r=document.documentElement;if(localStorage.getItem(${key})==="light"){var v=${vars};for(var k in v)r.style.setProperty(k,v[k]);r.style.colorScheme="light"}else{r.style.colorScheme="dark"}}catch(e){}})()`
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme tokens, no user input, "<" escaped above
      dangerouslySetInnerHTML={{ __html: js }}
    />
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Pace",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // ThemeScript sets color-scheme / CSS vars on <html> before hydration (to avoid a theme
    // flash), so the client <html> intentionally differs from the server's. suppressHydrationWarning
    // is React's escape hatch for exactly that — it silences the mismatch one level deep (only
    // <html>'s own attributes), not its children.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ConfigScript />
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <ApiProvider>
            <ToastProvider>{children}</ToastProvider>
          </ApiProvider>
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
