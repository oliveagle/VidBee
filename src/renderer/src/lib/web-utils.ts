export const isWebMode = !window.api

export const showWebModeWarning = (feature: string) => {
  console.warn(`${feature} is not available in web mode`)
}

export const openExternalLink = (url: string) => {
  if (window?.open) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
