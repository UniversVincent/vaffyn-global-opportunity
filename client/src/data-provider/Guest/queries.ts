import { useMutation, useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys, MutationKeys } from 'librechat-data-provider';

export const useGuestCapabilities = () =>
  useQuery({
    queryKey: [QueryKeys.guestCapabilities],
    queryFn: dataService.getGuestCapabilities,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

export const useGuestTurn = () =>
  useMutation({
    mutationKey: [MutationKeys.guestTurn],
    mutationFn: dataService.sendGuestTurn,
    retry: false,
  });

export const useGuestClear = () =>
  useMutation({
    mutationKey: [MutationKeys.guestClear],
    mutationFn: dataService.clearGuestSession,
    retry: false,
  });

export const useGuestState = () =>
  useQuery({
    queryKey: [QueryKeys.guestCapabilities, 'state'],
    queryFn: dataService.getGuestState,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
