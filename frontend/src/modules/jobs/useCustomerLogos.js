import { useQuery } from '@tanstack/react-query';
import { logos } from '../../api';
import { useOffer } from '../../lib/useMyAccess';

/**
 * The job's customer's active logos, for the line editor to suggest (F02).
 * A line typed with a logo's code applies it; without the suggestion the code
 * had to be known by heart. Empty where the role may not read logos.
 */
export function useCustomerLogos(customerId) {
  const offer = useOffer();
  const { data } = useQuery({
    queryKey: ['logos', customerId],
    queryFn: () => logos.list(customerId),
    enabled: Boolean(customerId) && offer('GET', '/logos'),
    staleTime: 60_000,
  });
  return data ?? [];
}
