import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { labelSchema, type LabelFormOutput, type LabelFormValues } from '../schemas/label-schemas';

/** Name and color form of one label; the name field takes the focus when the form opens. */
export function useLabelForm(
  defaultValues: LabelFormValues,
  onSubmit: (values: LabelFormOutput) => void,
) {
  const form = useForm<LabelFormValues, unknown, LabelFormOutput>({
    resolver: zodResolver(labelSchema),
    defaultValues,
  });
  const { setFocus } = form;

  useEffect(() => setFocus('name'), [setFocus]);

  return { form, submit: form.handleSubmit(onSubmit) };
}
