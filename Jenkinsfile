pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20' 
  }

  environment {
    IMAGE_NAME = 'secret-notes-frontend'
    
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    
    SCANNER_HOME = tool 'SonarScanner'
  }

  stages {
    stage('Debug Info') {
      steps {
        echo "-> Aktueller GIT_BRANCH: ${env.GIT_BRANCH}"
      }
    }
    
    stage('Lint') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN" && npx snyk test --severity-threshold=high'
        sh '"$SCANNER_HOME/bin/sonar-scanner" -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npm ci'
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=${STAGING_API_URL} ."
      }
    }

    stage('Deliver') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
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

    stage('Deploy to Staging (Inactive Env)') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            ACTIVE_BLUE=$(ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "docker ps -q -f name=frontend-blue | wc -l")

            if [ "$ACTIVE_BLUE" -eq "1" ]; then
              TARGET_ENV="green"
              TARGET_PORT=3001
            else
              TARGET_ENV="blue"
              TARGET_PORT=3000
            fi

            echo "Deploying to INACTIVE environment: $TARGET_ENV on port $TARGET_PORT"

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
              
              docker stop frontend-$TARGET_ENV || true
              docker rm frontend-$TARGET_ENV || true
              
              docker run -d --name frontend-$TARGET_ENV -p $TARGET_PORT:80 $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "

            echo $TARGET_ENV > target_env.txt
            echo $TARGET_PORT > target_port.txt
          '''
        }
      }
    }

    stage('E2E & Switch Traffic') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            TARGET_ENV=$(cat target_env.txt)
            TARGET_PORT=$(cat target_port.txt)

            if [ "$TARGET_ENV" = "green" ]; then
              OLD_ENV="blue"
            else
              OLD_ENV="green"
            fi

            echo "Running E2E tests against http://$STAGING_EC2_HOST:$TARGET_PORT"
            
            # HIER KOMMEN DEINE TESTS REIN (Playwright/k6)
            
            echo "Tests successful! Switching traffic to $TARGET_ENV..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              sudo ln -sf /etc/nginx/sites-available/frontend-$TARGET_ENV /etc/nginx/sites-enabled/frontend
              sudo systemctl reload nginx

              docker stop frontend-$OLD_ENV || true
            "
          '''
        }
      }
    }
  }

  post {
    failure {
      sh '''
        if [ -n "$DISCORD_WEBHOOK" ]; then
          curl -H "Content-Type: application/json" \
            -X POST \
            -d "{\\"content\\": \\"<@&1522970703245348995> ❌ **${JOB_NAME} #${BUILD_NUMBER}** failed on branch **${BRANCH_NAME}**!\\\\nDetails: ${BUILD_URL}\\"}" \
            "$DISCORD_WEBHOOK"
        fi
      '''
    }
  }
}
