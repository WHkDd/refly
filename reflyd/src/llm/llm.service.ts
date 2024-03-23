import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import omit from 'lodash.omit';

import { QdrantClient } from '@qdrant/js-client-rest';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { loadSummarizationChain } from 'langchain/chains';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';

import { AIGCContent, ChatMessage } from '@prisma/client';
import {
  qaSystemPrompt,
  contextualizeQSystemPrompt,
  summarizeSystemPrompt,
} from './prompts';
import { LLMChatMessage } from './schema';
import { HumanMessage } from 'langchain/schema';

import { uniqueFunc } from 'src/utils/unique';
import { ContentMeta } from './dto';

@Injectable()
export class LlmService implements OnModuleInit {
  private vectorStore: QdrantClient;
  private embeddings: OpenAIEmbeddings;
  private collectionName: string;

  private readonly logger = new Logger(LlmService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.vectorStore = new QdrantClient({
      url: this.configService.get('qdrant.url'),
      timeout: 5000,
    });
    this.collectionName = this.configService.get('qdrant.collectionName');
    this.embeddings = new OpenAIEmbeddings({
      timeout: 5000,
    });

    await this.ensureCollection();
    this.logger.log('LLM Service ready');
  }

  /**
   * Method to ensure the existence of a collection in the Qdrant database.
   * If the collection does not exist, it is created.
   * @returns Promise that resolves when the existence of the collection has been ensured.
   */
  async ensureCollection() {
    const response = await this.vectorStore.getCollections();

    const collectionNames = response.collections.map(
      (collection) => collection.name,
    );

    if (!collectionNames.includes(this.collectionName)) {
      await this.vectorStore.createCollection(this.collectionName, {
        vectors: {
          size: (await this.embeddings.embedQuery('test')).length,
          distance: 'Cosine',
        },
      });
    }

    this.logger.log(`qdrant collection initialized: ${this.collectionName}`);
  }

  /**
   * Extract metadata from weblinks.
   * @param doc valid langchain doc representing website content
   */
  async extractContentMeta(doc: Document): Promise<ContentMeta> {
    return;
  }

  /**
   * Apply content strategy.
   * @param doc
   * @returns
   */
  async applyStrategy(doc: Document): Promise<Partial<AIGCContent>> {
    return {
      title: '',
      content: '',
      sources: '',
    };
  }

  async indexPipelineFromLink(doc: Document) {
    // splitting / chunking
    const textSplitter = new RecursiveCharacterTextSplitter({
      separators: ['\n\n', '\n', ' ', ''],
      chunkSize: 1000,
      chunkOverlap: 200,
      lengthFunction: (str = '') => str.length || 0,
    });
    const documents = await textSplitter.splitDocuments([doc]);

    // embedding
    const texts = documents.map(({ pageContent }) => pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);

    // load into vector store
    if (vectors.length === 0) {
      return;
    }

    const points = vectors.map((embedding, idx) => ({
      id: uuid(),
      vector: embedding,
      payload: {
        content: documents[idx].pageContent,
        ...documents[idx].metadata,
      },
    }));

    await this.vectorStore.upsert(this.collectionName, {
      wait: true,
      points,
    });
  }

  async retrieval(query: string, filter) {
    /**
     * 1. 抽取关键字 or 实体
     * 2. 基于关键字多路召回
     * 3. rerank scores
     * 4. 取前
     */

    // 抽取关键字 or 实体
    const llm = new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0 });
    const parser = new JsonOutputFunctionsParser();
    const runnable = await llm
      .bind({
        functions: [
          {
            name: 'keyword_for_search_engine',
            description: `You are an expert search engine keywords extraction algorithm.
            Only extract keyword from the user query for search engine. If cannot extract keywords, the results should be empty array`,
            parameters: {
              type: 'object',
              properties: {
                keyword_list: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['keyword_list'],
            },
          },
        ],
        function_call: { name: 'keyword_for_search_engine' },
      })
      .pipe(parser);
    const res = (await runnable.invoke([new HumanMessage(query)])) as {
      keyword_list: string[];
    };

    // 基于关键字多路召回
    let results = [];
    await Promise.all(
      // 这里除了关键词，需要把 query 也带上
      [...(res?.keyword_list || []), query].map(async (keyword) => {
        const queryEmbedding = await this.embeddings.embedQuery(keyword);
        const keywordRetrievalResults = await this.vectorStore.search(
          this.collectionName,
          {
            vector: queryEmbedding,
            limit: 5,
            filter,
          },
        );

        results = results.concat(keywordRetrievalResults);
      }),
    );

    // rerank scores
    // TODO: 这里只考虑了召回阈值和数量，默认取五个，但是没有考虑 token 窗口，未来需要优化
    results = uniqueFunc(results, 'content')
      .sort((a, b) => (b?.score || 0) - (a?.score || 0))
      ?.filter((item) => item?.score >= 0.8)
      ?.slice(0, 6);

    return results;
  }

  async summary(
    prompt: string,
    docs: Document[],
    chatHistory: ChatMessage[],
    onMessage: (chunk: string) => void,
  ) {
    if (docs.length <= 0) return;

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });

    // 带元数据去拼 docs
    const weblinkDocs: Document[] = (
      await Promise.all(
        docs.map(async (doc) => {
          const { metadata } = doc;
          // 手动区分网页分割
          const dividerDocs = await textSplitter.createDocuments([
            `\n\n下面是网页 [${metadata?.title}](${metadata.source}) 的内容\n\n`,
          ]);
          return [...dividerDocs, doc];
        }),
      )
    ).flat();

    const llm = new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0 });
    const combineLLM = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0,
      streaming: true,
      callbacks: [
        {
          handleLLMNewToken(token: string): Promise<void> | void {
            onMessage(token);
          },
        },
      ],
    });

    const customPrompt = new PromptTemplate({
      template: summarizeSystemPrompt,
      inputVariables: ['text'],
    });
    const summarizeChain = loadSummarizationChain(llm, {
      type: 'map_reduce',
      combineLLM,
      combinePrompt: customPrompt,
    });
    await summarizeChain.invoke({
      input_documents: weblinkDocs,
    });
  }

  async chat(query: string, chatHistory: LLMChatMessage[], filter?: any) {
    this.logger.log(
      `activated with query: ${query}, filter: ${JSON.stringify(filter)}`,
    );

    const llm = new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0 });

    // 构建总结的 Prompt，将 question + chatHistory 总结成
    const contextualizeQPrompt = ChatPromptTemplate.fromMessages([
      ['system', contextualizeQSystemPrompt],
      new MessagesPlaceholder('chatHistory'),
      ['human', '{question}'],
    ]);
    const contextualizeQChain = contextualizeQPrompt
      .pipe(llm as any)
      .pipe(new StringOutputParser());
    const questionWithContext =
      chatHistory.length === 0
        ? query
        : await contextualizeQChain.invoke({
            question: query,
            chatHistory,
          });

    const qaPrompt = ChatPromptTemplate.fromMessages([
      ['system', qaSystemPrompt],
      new MessagesPlaceholder('chatHistory'),
      ['human', '{question}'],
    ]);

    // 基于上下文进行问答
    const ragChain = await createStuffDocumentsChain({
      llm,
      prompt: qaPrompt,
      outputParser: new StringOutputParser(),
    });

    const retrievalResults = await this.retrieval(questionWithContext, filter);

    const retrievedDocs = retrievalResults.map((res) => ({
      metadata: omit(res.payload, 'content'),
      pageContent: res.payload.content as string,
      score: res.score, // similarity score
    }));

    return {
      sources: retrievedDocs,
      stream: ragChain.stream({
        question: query,
        context: retrievedDocs,
        chatHistory,
      }),
    };
  }
}
