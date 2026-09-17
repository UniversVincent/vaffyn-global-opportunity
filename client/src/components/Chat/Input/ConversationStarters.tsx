import { useMemo } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import useOverseasStarters from '~/components/Overseas/starters';
import { getIconEndpoint, getEntity, getModelSpec } from '~/utils';
import StarterList from './StarterList';

const ConversationStarters = () => {
  const { conversation, isSubmitting } = useChatContext();
  const overseasStarters = useOverseasStarters();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (modelSpec?.conversation_starters?.length) {
      return modelSpec.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity, modelSpec]);

  const starters = conversation_starters.length
    ? conversation_starters.slice(0, Constants.MAX_CONVO_STARTERS).map((text) => ({ text }))
    : overseasStarters;
  if (
    !conversation_starters.length &&
    (isAgent || isAssistant || modelSpec || !conversation?.endpoint)
  ) {
    return null;
  }

  return (
    <div className="mb-6 mt-2 w-full px-4">
      <StarterList
        key={JSON.stringify([
          conversation?.conversationId,
          conversation?.endpoint,
          conversation?.model,
          conversation?.agent_id,
          conversation?.assistant_id,
          conversation?.spec,
        ])}
        starters={starters}
        disabled={isSubmitting}
      />
    </div>
  );
};

export default ConversationStarters;
