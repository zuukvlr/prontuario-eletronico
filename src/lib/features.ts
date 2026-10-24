/** Anexos dependem do Firebase Storage (exige plano Blaze em projetos novos). Defina VITE_STORAGE_ENABLED=false no plano gratuito. */
export const storageEnabled = import.meta.env.VITE_STORAGE_ENABLED !== 'false'
