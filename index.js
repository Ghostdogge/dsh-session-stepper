/**
 * Host half — deliberately empty.
 *
 * Everything this plugin does happens in the browser half (client.js): it only
 * registers two shortcut commands and calls the existing workspace navigation.
 * No services, routes or persistence, so the Host side has nothing to apply.
 */

export const name = 'dsh-session-stepper'
export const inject = []
export function apply() {}

export default { name, inject, apply }
