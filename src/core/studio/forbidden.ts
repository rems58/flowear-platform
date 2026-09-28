/**
 * Mots qu'une IA créateur ne peut pas employer dans sa persona, ses suggestions, sa présentation
 * ou ses connaissances : ils promettent un diagnostic, une guérison, un résultat ou un gain.
 * Les avertissements (`disclaimer`) ne sont pas concernés : « pas un diagnostic » y est attendu.
 * Comparaison sur le mot entier, sans casse.
 */
export const FORBIDDEN_WORDS: Record<string, readonly string[]> = {
  fr: ['diagnostic', 'diagnostics', 'diagnostiquer', 'diagnostique', 'guérir', 'guérison', 'guéri', 'guérie', 'garanti', 'garantie', 'garantis', 'remboursé', 'remboursée', 'remboursement', 'prescription', 'prescrire', 'dosage', 'posologie', 'rendement', 'investir', 'investissement'],
  en: ['diagnose', 'diagnosis', 'cure', 'cured', 'guaranteed', 'guarantee', 'refund', 'refunded', 'prescription', 'prescribe', 'dosage', 'yield', 'invest', 'investment'],
  es: ['diagnóstico', 'diagnosticar', 'curar', 'curación', 'garantizado', 'garantía', 'reembolso', 'reembolsado', 'receta', 'prescribir', 'dosis', 'rendimiento', 'invertir', 'inversión'],
  de: ['diagnose', 'diagnostizieren', 'heilen', 'heilung', 'garantiert', 'garantie', 'rückerstattung', 'erstattet', 'rezept', 'verschreiben', 'dosierung', 'rendite', 'investieren', 'investition'],
  it: ['diagnosi', 'diagnosticare', 'guarire', 'guarigione', 'garantito', 'garanzia', 'rimborso', 'rimborsato', 'prescrizione', 'prescrivere', 'dosaggio', 'rendimento', 'investire', 'investimento'],
}

/** Motifs d'injection : quelqu'un essaie de reprogrammer le modèle depuis un texte. */
export const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore[sz]?\s+(toutes?\s+|les\s+|tes\s+|the\s+|all\s+|your\s+|previous\s+|above\s+)*(instructions?|consignes?|r[èe]gles?|rules?|prompts?)/i,
  /oublie[sz]?\s+(toutes?\s+|tes\s+|les\s+)*(instructions?|consignes?|r[èe]gles?)/i,
  /forget\s+(all\s+|your\s+|the\s+)*(instructions?|rules?|prompts?)/i,
  /r[ée]v[èe]le[sz]?\s+(ton|tes|le|la|les)\s+(prompt|instructions?|syst[èe]me|consignes?)/i,
  /system\s*prompt/i,
  /tu\s+es\s+maintenant/i,
  /you\s+are\s+now/i,
  /<\|/,
  /"(tool_calls?|function_call|tool_name)"\s*:/i,
]
