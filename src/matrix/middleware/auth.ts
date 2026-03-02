/**
 * Matrix Server Authentication Middleware
 * Verifies multi-account feature access via API Key Guard
 */

import { Request, Response, NextFunction } from 'express';
import { getGuard } from '../../guard/apiKeyGuard';
import logger from '../../utils/logger';

export interface AuthConfig {
  tier: string;
  features: {
    multiAccount: boolean;
  };
}

/**
 * Authentication middleware for Matrix server routes
 * Checks if user has access to multi-account features
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const guard = getGuard();

  // Check if API key is configured
  if (!guard.hasKey()) {
    logger.warn('[Matrix Auth] No API key configured');
    res.status(403).json({
      error: 'Multi-account feature not available',
      tier: 'none',
      message: 'API Key required for multi-account management',
      upgradeUrl: 'https://pigbunai.com/pricing'
    });
    return;
  }

  // For now, we'll verify the key exists
  // In the future, getConfig() will return tier and feature flags
  // TODO: Implement getConfig() in ApiKeyGuard to fetch user tier

  logger.info('[Matrix Auth] Access granted for multi-account features');
  next();
}

/**
 * WebSocket authentication check
 * Returns error message if authentication fails, null if success
 */
export function checkWebSocketAuth(): { error?: string; tier?: string; upgradeUrl?: string } | null {
  const guard = getGuard();

  if (!guard.hasKey()) {
    logger.warn('[Matrix Auth] WebSocket connection denied - no API key');
    return {
      error: 'Multi-account feature not available',
      tier: 'none',
      upgradeUrl: 'https://pigbunai.com/pricing'
    };
  }

  logger.info('[Matrix Auth] WebSocket connection authorized');
  return null;
}
