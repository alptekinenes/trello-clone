import type { CreateLabelRequest, LabelDto, UpdateLabelRequest } from '@trello/contracts';
import { patchLabel, removeLabel, upsertLabel } from '../lib/board-cache';
import { labelsApi } from './labels-api';
import { useBoardMutation } from './use-board-mutation';

/** Not optimistic: the form waits for the label, which needs its server id. */
export function useCreateLabel(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (body: CreateLabelRequest) => labelsApi.create(boardId, body),
    onSuccessCache: (detail, label: LabelDto) => upsertLabel(detail, label),
  });
}

export interface UpdateLabelVariables extends UpdateLabelRequest {
  labelId: string;
}

/** Optimistic: the new name and color show at once and are rolled back if the request fails. */
export function useUpdateLabel(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ labelId, ...body }: UpdateLabelVariables) => labelsApi.update(labelId, body),
    optimistic: (detail, { labelId, ...changes }) => patchLabel(detail, labelId, changes),
    onSuccessCache: (detail, label: LabelDto) => upsertLabel(detail, label),
  });
}

/** Not optimistic: the manager asks first and waits. Cards lose the label with it. */
export function useDeleteLabel(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (labelId: string) => labelsApi.remove(labelId),
    onSuccessCache: (detail, _data, labelId) => removeLabel(detail, labelId),
  });
}
