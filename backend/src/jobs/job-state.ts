import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { JobStatus as S } from './job.entity';

const TRANSITIONS: Readonly<Record<S, readonly S[]>> = {
  [S.TO_COORDINATE]: [S.SCHEDULED, S.CANCELLED],
  [S.SCHEDULED]: [S.SCHEDULED, S.IN_PROGRESS, S.COMPLETED, S.CANCELLED, S.TO_COORDINATE],
  [S.IN_PROGRESS]: [S.COMPLETED, S.CANCELLED],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [],
};

export function assertJobTransition(from: S, to: S): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw AppException.conflict(ErrorCode.INVALID_REQUEST_STATE, 'Transición de trabajo no permitida', {
      from,
      to,
    });
  }
}
