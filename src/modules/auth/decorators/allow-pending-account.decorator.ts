import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_ACCOUNT = 'allowPendingAccount';

/** Allow a PENDING legacy account to complete the existing profile workflow. */
export const AllowPendingAccount = () => SetMetadata(ALLOW_PENDING_ACCOUNT, true);
