import { execSync } from 'child_process';

/**
 * Checks if Docker is installed and available in PATH.
 * @returns {boolean} true if Docker is installed, false otherwise.
 */
export function dockerIsInstalled(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}
