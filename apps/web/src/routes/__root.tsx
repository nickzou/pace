import { TanStackDevtools } from "@tanstack/react-devtools"
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { ApiProvider } from "../lib/api"
import { getConfig } from "../lib/config"
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
    <html lang="en">
      <head>
        <HeadContent />
        <ConfigScript />
      </head>
      <body>
        <ApiProvider>{children}</ApiProvider>
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
