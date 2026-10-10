import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * The router scrolls after every render pass, including invalidations and route HMR
 * (every presentation edit touches styles.css, which hot-reloads the root route). Only let it
 * act when the path changes, so edits keep the viewer's place in the deck. Reloads and
 * back/forward restore the saved position; new pages start at the top.
 */
let lastPathname: string | undefined
function scrollOnPathChange({ location }: { location: { pathname: string } }): boolean {
  const changed = location.pathname !== lastPathname
  lastPathname = location.pathname
  return changed
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: scrollOnPathChange,
  })
}
