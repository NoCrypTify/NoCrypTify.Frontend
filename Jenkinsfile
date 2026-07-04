// Self-hosted CI/CD pipeline for the frontend (Jenkins on AWS EC2).
//
// Prerequisites on the Jenkins agent: Node 22, Docker, sonar-scanner CLI, snyk CLI.
// Set up as a Multibranch Pipeline job pointed at the GitHub repo (webhook-triggered)
// so `BRANCH_NAME` / `when { branch }` resolve correctly.
//
// Required Jenkins credentials: dockerhub-credentials (username/password),
// sonar-token (secret text), snyk-token (secret text).
// Required env on the controller/agent: SONAR_HOST_URL, STAGING_API_URL, SLACK_WEBHOOK_URL (optional).
//
// Branch behavior (spec §3): main -> Lint/Test/Build only; deploy/production -> all stages.
pipeline {
  agent any

  environment {
    IMAGE_NAME = 'secret-notes-frontend'
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
  }

  stages {
    stage('Lint') {
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN" && npx snyk test --severity-threshold=high'
        sh 'sonar-scanner -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.login="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      steps {
        sh 'npm ci'
        // TODO §3: add Jest config + >=10 tests (deferred on purpose).
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=\$STAGING_API_URL ."
      }
    }

    stage('Deliver') {
      when { branch 'deploy/production' }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy (Blue/Green)') {
      when { branch 'deploy/production' }
      steps {
        echo 'TODO §8: provision AWS EC2 staging + implement blue/green swap script.'
      }
    }

    stage('E2E & Performance') {
      when { branch 'deploy/production' }
      steps {
        echo 'TODO: run Playwright + k6 against staging; on success, switch Blue/Green.'
      }
    }
  }

  post {
    failure {
      sh '''
        if [ -n "$SLACK_WEBHOOK_URL" ]; then
          curl -s -X POST -H "Content-type: application/json" \
            --data "{\"text\":\"❌ ${JOB_NAME} #${BUILD_NUMBER} failed on ${BRANCH_NAME} — ${BUILD_URL}\"}" \
            "$SLACK_WEBHOOK_URL"
        fi
      '''
    }
  }
}
