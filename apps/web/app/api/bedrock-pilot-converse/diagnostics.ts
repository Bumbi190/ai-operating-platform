/**
 * Non-sensitive classification of the AWS denial for the isolated Bedrock pilot.
 * Deliberately never returns AWS service messages, ARNs, tokens, or request IDs.
 * This is diagnostics only: do not change IAM from the classification alone.
 */
export function classifyBedrockAccessDenial(error: unknown): string {
  const detail = error instanceof Error ? error.message.toLowerCase() : ''
  if (/aws-marketplace|marketplace subscription/.test(detail)) {
    return 'marketplace_entitlement'
  }
  if (/explicit deny|explicitly denied|denied by.*(scp|organizations)/.test(detail)) {
    return 'explicit_deny'
  }
  if (/no identity-based policy allows|no session policy allows/.test(detail)) {
    return 'missing_identity_allow'
  }
  if (/contact aws sales|not available for (this|your) account|account.level.*(restricted|restriction)/.test(detail)) {
    return 'account_entitlement_restriction'
  }
  if (/not authorized to perform.*bedrock:invokemodel|not authorized.*foundation-model/.test(detail)) {
    return 'iam_model_authorization'
  }
  if (/model access is denied|model access has been denied|model is not accessible|access to the model/.test(detail)) {
    return 'model_access_restriction'
  }
  return 'unknown_access_denial'
}
