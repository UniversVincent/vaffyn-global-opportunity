import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys, MutationKeys } from 'librechat-data-provider';

export const useResearchQuery = () =>
  useQuery({
    queryKey: [QueryKeys.researchReport],
    queryFn: dataService.getResearchReport,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

export const useResearchRefresh = () => {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.researchRefresh],
    mutationFn: dataService.refreshResearchReport,
    onSuccess: (data) => client.setQueryData([QueryKeys.researchReport], data),
    onError: () => client.invalidateQueries([QueryKeys.researchReport]),
    retry: false,
  });
};

export const useResearchArchive = () =>
  useMutation({
    mutationKey: [MutationKeys.researchArchive],
    mutationFn: dataService.getResearchArchive,
    retry: false,
  });
