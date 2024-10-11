import { Markdown } from '@refly-packages/ai-workspace-common/components/markdown';
import { IconCloseCircle, IconLoading, IconRefresh } from '@arco-design/web-react/icon';

// 自定义样式
import './index.scss';
import { useSearchParams } from '@refly-packages/ai-workspace-common/utils/router';
import { Skeleton, Message as message, Empty, Affix, Alert, Spin, Button } from '@arco-design/web-react';
import {
  type KnowledgeBaseTab,
  useKnowledgeBaseStore,
} from '@refly-packages/ai-workspace-common/stores/knowledge-base';
// 请求
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
// 类型
import { Resource } from '@refly/openapi-schema';
import { memo, useEffect, useState } from 'react';
import { safeParseURL } from '@refly/utils/url';
import { LabelGroup } from '@refly-packages/ai-workspace-common/components/knowledge-base/label-group';
import { useReloadListState } from '@refly-packages/ai-workspace-common/stores/reload-list-state';

// content selector
import { useContentSelector } from '@refly-packages/ai-workspace-common/modules/content-selector/hooks/use-content-selector';
import '@refly-packages/ai-workspace-common/modules/content-selector/styles/content-selector.scss';
import classNames from 'classnames';
import { useContentSelectorStore } from '@refly-packages/ai-workspace-common/modules/content-selector/stores/content-selector';
import ResourceCollectionList from '@refly-packages/ai-workspace-common/components/knowledge-base/resource-detail/resource-collection-list';
import { useTranslation } from 'react-i18next';

export const KnowledgeBaseResourceDetail = memo(() => {
  const { t } = useTranslation();
  const [isFetching, setIsFetching] = useState(false);
  const knowledgeBaseStore = useKnowledgeBaseStore((state) => ({
    currentResource: state.currentResource,
    updateResource: state.updateResource,
    resetTabs: state.resetTabs,
  }));

  // 初始块选择
  const { showContentSelector, scope } = useContentSelectorStore((state) => ({
    showContentSelector: state.showContentSelector,
    scope: state.scope,
  }));
  const { initMessageListener, initContentSelectorElem } = useContentSelector(
    'knowledge-base-resource-content',
    'resourceSelection',
  );

  const [queryParams] = useSearchParams();
  const resId = queryParams.get('resId');
  const kbId = queryParams.get('kbId');
  const reloadKnowledgeBaseState = useReloadListState();
  const [resourceDetail, setResourceDetail] = useState<Resource>(knowledgeBaseStore?.currentResource as Resource);

  const handleGetDetail = async (resourceId: string, setFetch: boolean = true) => {
    setFetch && setIsFetching(true);
    try {
      const { data: newRes, error } = await getClient().getResourceDetail({
        query: {
          resourceId,
        },
      });

      if (error) {
        throw error;
      }
      if (!newRes?.success) {
        throw new Error(newRes?.errMsg);
      }

      const resource = newRes?.data as Resource;
      knowledgeBaseStore.updateResource(resource);
    } catch (err) {
      message.error('获取内容详情失败，请重新刷新试试');
    }

    setFetch && setIsFetching(false);
  };

  const [isReindexing, setIsReindexing] = useState(false);
  const handleReindexResource = async (resourceId: string) => {
    if (!resourceId || isReindexing) return;

    try {
      setIsReindexing(true);
      setResourceDetail({ ...resourceDetail, indexStatus: 'wait_index' });
      const { data, error } = await getClient().reindexResource({
        body: {
          resourceIds: [resourceId],
        },
      });

      if (error) {
        throw error;
      }
      if (!data?.success) {
        throw new Error(data?.errMsg);
      }

      if (data.data?.length) {
        const resource = data.data[0];
        knowledgeBaseStore.updateResource({ ...resourceDetail, indexStatus: resource.indexStatus });
      }
    } catch (error) {
      message.error(t('common.putErr'));
    }
    setIsReindexing(false);
  };

  const handleUpdateCollections = (collectionId: string) => {
    if (resId) {
      handleGetDetail(resId as string);
    }
    if (collectionId === kbId) {
      reloadKnowledgeBaseState.setReloadKnowledgeBaseList(true);
    }
  };

  useEffect(() => {
    if (resId && reloadKnowledgeBaseState.reloadResourceDetail) {
      handleGetDetail(resId as string);
    }
    reloadKnowledgeBaseState.setReloadResourceDetail(false);
  }, [reloadKnowledgeBaseState.reloadResourceDetail]);

  useEffect(() => {
    if (resId) {
      console.log('params resId', resId);
      handleGetDetail(resId as string);
    }
  }, [resId]);

  useEffect(() => {
    if (kbId && !resId) {
      knowledgeBaseStore.resetTabs();
    }
  }, [kbId]);

  // 初始化块选择
  useEffect(() => {
    const remove = initMessageListener();

    return () => {
      remove();
    };
  }, [resId]);

  useEffect(() => {
    setResourceDetail(knowledgeBaseStore?.currentResource as Resource);
  }, [knowledgeBaseStore?.currentResource]);

  // refresh every 2 seconds if resource is waiting to be parsed or indexed
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (['wait_parse', 'wait_index'].includes(knowledgeBaseStore?.currentResource?.indexStatus)) {
      intervalId = setInterval(() => {
        const setFetch = false;
        handleGetDetail(resId as string, setFetch);
      }, 2000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [knowledgeBaseStore?.currentResource?.indexStatus]);

  return (
    <div className="knowledge-base-resource-detail-container">
      {resId ? (
        <div className="knowledge-base-resource-detail-body">
          {isFetching ? (
            <div style={{ margin: '20px auto' }}>
              <Skeleton animation style={{ marginTop: 24 }}></Skeleton>
            </div>
          ) : (
            <div className="knowledge-base-resource-meta">
              <Affix offsetTop={48.1}>
                <ResourceCollectionList
                  collections={resourceDetail?.collections}
                  updateCallback={(collectionId) => handleUpdateCollections(collectionId)}
                />
              </Affix>

              {['wait_index', 'index_failed'].includes(resourceDetail?.indexStatus) && (
                <Alert
                  className={`${resourceDetail?.indexStatus}-alert`}
                  style={{ marginBottom: 16 }}
                  type={resourceDetail?.indexStatus === 'wait_index' ? 'warning' : 'error'}
                  icon={
                    resourceDetail?.indexStatus === 'wait_index' ? (
                      <IconLoading style={{ color: 'rgb(202 138 4)' }} />
                    ) : (
                      <IconCloseCircle style={{ color: 'rgb(220 38 38)' }} />
                    )
                  }
                  content={
                    t(`resource.${resourceDetail?.indexStatus}`) +
                    ': ' +
                    t(`resource.${resourceDetail?.indexStatus}_tip`)
                  }
                  action={
                    resourceDetail?.indexStatus === 'index_failed' ? (
                      <Button
                        size="mini"
                        type="outline"
                        loading={isReindexing}
                        icon={<IconRefresh />}
                        className="retry-btn"
                        onClick={() => handleReindexResource(resId)}
                      >
                        {t('common.retry')}
                      </Button>
                    ) : null
                  }
                />
              )}

              <div className="knowledge-base-directory-site-intro">
                <div className="site-intro-icon">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${safeParseURL(resourceDetail?.data?.url as string)}&sz=${32}`}
                    alt={resourceDetail?.data?.url}
                  />
                </div>
                <div className="site-intro-content">
                  <p className="site-intro-site-name">{resourceDetail?.data?.title}</p>
                  <a className="site-intro-site-url" href={resourceDetail?.data?.url} target="_blank">
                    {resourceDetail?.data?.url}
                  </a>
                </div>
              </div>
              {/* <div className="knowledge-base-directory-action">
                <div className="action-summary">
                  <HiOutlineLightBulb />
                  <span className="action-summary-text">AI Summary</span>
                </div>

                <div className="action-summary">
                  <AiOutlineCodepen />
                  <span className="action-summary-text">知识图谱</span>
                </div>
              </div> */}
              {resourceDetail && <LabelGroup entityId={resourceDetail.resourceId} entityType={'resource'} />}
            </div>
          )}
          {isFetching ? (
            <div style={{ margin: '20px auto' }}>
              <Skeleton animation style={{ marginTop: 24 }}></Skeleton>
              <Skeleton animation style={{ marginTop: 24 }}></Skeleton>
              <Skeleton animation style={{ marginTop: 24 }}></Skeleton>
            </div>
          ) : (
            <div
              className={classNames('knowledge-base-resource-content', {
                'refly-selector-mode-active': showContentSelector,
                'refly-block-selector-mode': scope === 'block',
                'refly-inline-selector-mode': scope === 'inline',
              })}
            >
              {initContentSelectorElem()}
              <div className="knowledge-base-resource-content-title">{resourceDetail?.title}</div>
              <Markdown content={resourceDetail?.content || ''}></Markdown>
            </div>
          )}
        </div>
      ) : (
        <div className="knowledge-base-resource-detail-empty">
          <Empty description={t('common.empty')} />
        </div>
      )}
    </div>
  );
});
