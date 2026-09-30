import { AppException } from '../common/errors/app-exception';
import { JobStatus } from './job.entity';
import { assertJobTransition } from './job-state';

describe('transiciones de trabajo', () => {
  it('permite coordinar, iniciar y cerrar sin reabrir estados terminales', () => {
    expect(() => assertJobTransition(JobStatus.TO_COORDINATE, JobStatus.SCHEDULED)).not.toThrow();
    expect(() => assertJobTransition(JobStatus.SCHEDULED, JobStatus.IN_PROGRESS)).not.toThrow();
    expect(() => assertJobTransition(JobStatus.IN_PROGRESS, JobStatus.COMPLETED)).not.toThrow();
    expect(() => assertJobTransition(JobStatus.COMPLETED, JobStatus.SCHEDULED)).toThrow(AppException);
    expect(() => assertJobTransition(JobStatus.CANCELLED, JobStatus.IN_PROGRESS)).toThrow(AppException);
  });

  it('permite reprogramar el mismo trabajo sin reabrir la solicitud', () => {
    expect(() => assertJobTransition(JobStatus.SCHEDULED, JobStatus.SCHEDULED)).not.toThrow();
  });
});
