import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Notification, NotificationType } from '../../notifications/notification.entity';
import { notify } from '../../notifications/notify';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { ProRequestsService } from '../pro-requests.service';
import { ServiceRequest } from '../service-request.entity';
import { RequestQuestion } from './request-question.entity';
import {
  MAX_QUESTIONS_PER_PROFESSIONAL,
  canAnswerQuestion,
  canAskQuestion,
  normalizeQuestionText,
  questionTextProblem,
} from './request-question-rules';

export function presentQuestion(q: RequestQuestion) {
  return { id: q.id, question: q.question, answer: q.answer, askedAt: q.askedAt, answeredAt: q.answeredAt };
}

/** Consultas antes de presupuestar: el profesional pregunta, el cliente responde. */
@Injectable()
export class RequestQuestionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly proRequests: ProRequestsService,
  ) {}

  // ---- Profesional ---------------------------------------------------------

  /** Sus consultas en esta solicitud y si puede hacer otra. */
  async listForProfessional(pro: ProfessionalProfile, requestId: string) {
    const view = await this.proRequests.get(pro, requestId);
    const items = await this.dataSource.getRepository(RequestQuestion).find({
      where: { requestId, professionalId: pro.id },
      order: { askedAt: 'ASC' },
    });
    const allowed = canAskQuestion({
      requestStatus: view.status as ServiceRequest['status'],
      invitationStatus: view.invitationStatus,
      blocked: view.opportunity.blocked,
      delayed: view.opportunity.delayed,
    });
    const pending = items.some((q) => !q.answer);
    return {
      items: items.map(presentQuestion),
      canAsk: allowed && !pending && items.length < MAX_QUESTIONS_PER_PROFESSIONAL,
      max: MAX_QUESTIONS_PER_PROFESSIONAL,
    };
  }

  async ask(pro: ProfessionalProfile, requestId: string, text: string) {
    const question = normalizeQuestionText(text);
    const problem = questionTextProblem(question, 'la consulta');
    if (problem) throw AppException.unprocessable(ErrorCode.INVALID_QUESTION, problem);
    // Mismo criterio de acceso que el detalle (404 si no fue invitado; demorada o bloqueada no pregunta).
    const view = await this.proRequests.get(pro, requestId);
    if (
      !canAskQuestion({
        requestStatus: view.status as ServiceRequest['status'],
        invitationStatus: view.invitationStatus,
        blocked: view.opportunity.blocked,
        delayed: view.opportunity.delayed,
      })
    ) {
      throw AppException.conflict(ErrorCode.QUESTION_NOT_ALLOWED, 'Esta solicitud ya no admite consultas.');
    }
    await this.dataSource.transaction(async (m) => {
      const request = await this.lockRequest(m, requestId);
      const existing = await m.find(RequestQuestion, { where: { requestId, professionalId: pro.id } });
      if (existing.some((q) => !q.answer)) {
        throw AppException.conflict(ErrorCode.QUESTION_PENDING, 'Esperá la respuesta del cliente antes de hacer otra consulta.');
      }
      if (existing.length >= MAX_QUESTIONS_PER_PROFESSIONAL) {
        throw AppException.conflict(
          ErrorCode.QUESTIONS_LIMIT_REACHED,
          `Ya hiciste ${MAX_QUESTIONS_PER_PROFESSIONAL} consultas en esta solicitud.`,
        );
      }
      const saved = await m.save(m.create(RequestQuestion, { requestId, professionalId: pro.id, question: question! }));
      await notify(
        m,
        { userId: request.clientId, type: NotificationType.CLIENT_QUESTION_RECEIVED, requestId, dedupeRef: saved.id },
        pro.userId,
      );
    });
    return this.listForProfessional(pro, requestId);
  }

  // ---- Cliente -------------------------------------------------------------

  /** Consultas de todos los profesionales de una solicitud propia, agrupadas por profesional. */
  async listForClient(clientId: string, requestId: string) {
    const request = await this.dataSource.getRepository(ServiceRequest).findOne({ where: { id: requestId, clientId } });
    if (!request) throw AppException.notFound('Solicitud');
    const rows = await this.dataSource.getRepository(RequestQuestion).find({
      where: { requestId },
      relations: { professional: { user: true } },
      order: { askedAt: 'ASC' },
    });
    const groups = new Map<string, { professional: { id: string; displayName: string }; items: ReturnType<typeof presentQuestion>[] }>();
    for (const q of rows) {
      const user = q.professional.user;
      const group = groups.get(q.professionalId) ?? {
        professional: { id: q.professionalId, displayName: `${user.firstName} ${user.lastName}` },
        items: [],
      };
      group.items.push(presentQuestion(q));
      groups.set(q.professionalId, group);
    }
    return { groups: [...groups.values()], canAnswer: canAnswerQuestion(request.status) };
  }

  async answer(clientId: string, requestId: string, questionId: string, text: string) {
    const answer = normalizeQuestionText(text);
    const problem = questionTextProblem(answer, 'la respuesta');
    if (problem) throw AppException.unprocessable(ErrorCode.INVALID_QUESTION, problem);
    await this.dataSource.transaction(async (m) => {
      const request = await this.lockRequest(m, requestId);
      if (request.clientId !== clientId) throw AppException.notFound('Solicitud');
      const question = await m.findOne(RequestQuestion, {
        where: { id: questionId, requestId },
        relations: { professional: true },
        lock: { mode: 'pessimistic_write', tables: ['request_questions'] },
      });
      if (!question) throw AppException.notFound('Consulta');
      if (question.answer) throw AppException.conflict(ErrorCode.QUESTION_ALREADY_ANSWERED, 'Ya respondiste esta consulta.');
      if (!canAnswerQuestion(request.status)) {
        throw AppException.conflict(ErrorCode.QUESTION_NOT_ALLOWED, 'Esta solicitud ya no recibe presupuestos.');
      }
      question.answer = answer;
      question.answeredAt = new Date();
      await m.save(question);
      // La consulta respondida ya no pide nada al cliente; el profesional recibe la respuesta.
      await m.update(
        Notification,
        { userId: clientId, dedupeKey: `${NotificationType.CLIENT_QUESTION_RECEIVED}:${question.id}`, readAt: IsNull() },
        { readAt: new Date() },
      );
      await notify(
        m,
        {
          userId: question.professional.userId,
          type: NotificationType.PRO_QUESTION_ANSWERED,
          requestId,
          dedupeRef: question.id,
        },
        clientId,
      );
    });
    return this.listForClient(clientId, requestId);
  }

  private async lockRequest(m: EntityManager, requestId: string): Promise<ServiceRequest> {
    const request = await m.findOne(ServiceRequest, { where: { id: requestId }, lock: { mode: 'pessimistic_write' } });
    if (!request) throw AppException.notFound('Solicitud');
    return request;
  }
}
