import { SetMetadata } from '@nestjs/common';

export const ALLOW_INCOMPLETE_PROFILE = 'allowIncompleteProfile';

/** Allow authenticated users without a nickname to inspect or complete onboarding. */
export const AllowIncompleteProfile = () => SetMetadata(ALLOW_INCOMPLETE_PROFILE, true);
